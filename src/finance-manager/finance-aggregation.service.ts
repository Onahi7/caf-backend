import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Sale, SaleDocument } from '../sales/schemas/sale.schema.js';
import { Shift, ShiftDocument } from '../shifts/schemas/shift.schema.js';
import { Expense, ExpenseDocument } from '../expenses/schemas/expense.schema.js';
import { FinanceTransaction, FinanceTransactionDocument } from '../finance/schemas/finance-transaction.schema.js';
import { MarketerSale, MarketerSaleDocument } from '../marketer/schemas/marketer-sale.schema.js';
import { MarketerProductAssignment, MarketerProductAssignmentDocument } from '../marketer/schemas/marketer-product-assignment.schema.js';
import { PurchaseOrder, PurchaseOrderDocument } from '../purchases/schemas/purchase-order.schema.js';
import { MicroserviceClientService } from './microservice-client.service.js';

export interface ServiceFinancials {
  revenue: number;
  expenses: number;
  profit: number;
  outstanding: number;
  orders: number;
  byPaymentMethod: { method: string; count: number; total: number }[];
  reconciliation: {
    submitted: boolean;
    status: string;
    submittedBy: string;
    notes: string;
    income: { cash: number; orangeMoney: number; afrimoney: number; total: number };
    expenditures: { cash: number; orangeMoney: number; afrimoney: number; total: number };
    netExpected: { cash: number; orangeMoney: number; afrimoney: number; total: number };
    actual: { cash: number; orangeMoney: number; afrimoney: number; total: number };
    variance: { cash: number; orangeMoney: number; afrimoney: number; total: number };
  } | null;
}

export interface UnifiedDashboard {
  revenue: {
    totalSales: number;
    totalRevenue: number;
    totalReturns: number;
    netRevenue: number;
    salesCount: number;
  };
  expenses: {
    totalShiftExpenses: number;
    totalFinanceExpenses: number;
    totalExpenses: number;
    byCategory: { category: string; total: number; count: number }[];
  };
  cashPosition: {
    totalOpeningCash: number;
    totalClosingCash: number;
    totalExpectedCash: number;
    totalVariance: number;
    openShifts: number;
    closedShifts: number;
  };
  creditOutstanding: {
    totalCreditSales: number;
    totalBalanceDue: number;
    overdueCount: number;
    overdueAmount: number;
  };
  marketer: {
    totalAssignedValue: number;
    totalSoldValue: number;
    totalOutstanding: number;
    unitsAssigned: number;
    unitsSold: number;
    unitsRemaining: number;
  };
  purchases: {
    totalPurchaseValue: number;
    receivedValue: number;
    pendingValue: number;
  };
  profitLoss: {
    grossRevenue: number;
    costOfGoods: number;
    grossProfit: number;
    operatingExpenses: number;
    netProfit: number;
    margin: number;
  };
  byBranch: {
    branchId: string;
    branchName: string;
    revenue: number;
    expenses: number;
    profit: number;
    salesCount: number;
  }[];
  byPaymentMethod: {
    method: string;
    count: number;
    total: number;
  }[];
  externalServices: {
    caf: ServiceFinancials;
    emr: ServiceFinancials;
    lab: ServiceFinancials;
    combined: {
      totalRevenue: number;
      totalExpenses: number;
      totalProfit: number;
      totalOutstanding: number;
    };
  };
}

@Injectable()
export class FinanceAggregationService {
  private readonly logger = new Logger(FinanceAggregationService.name);

  constructor(
    @InjectModel(Sale.name) private readonly saleModel: Model<SaleDocument>,
    @InjectModel(Shift.name) private readonly shiftModel: Model<ShiftDocument>,
    @InjectModel(Expense.name) private readonly expenseModel: Model<ExpenseDocument>,
    @InjectModel(FinanceTransaction.name) private readonly financeModel: Model<FinanceTransactionDocument>,
    @InjectModel(MarketerSale.name) private readonly marketerSaleModel: Model<MarketerSaleDocument>,
    @InjectModel(MarketerProductAssignment.name) private readonly assignmentModel: Model<MarketerProductAssignmentDocument>,
    @InjectModel(PurchaseOrder.name) private readonly purchaseModel: Model<PurchaseOrderDocument>,
    private readonly microserviceClient: MicroserviceClientService,
  ) {}

  async getUnifiedDashboard(
    branchId?: string,
    startDate?: string,
    endDate?: string,
  ): Promise<UnifiedDashboard> {
    const dateFilter: Record<string, any> = {};
    if (startDate || endDate) {
      dateFilter.createdAt = {};
      if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
      if (endDate) dateFilter.createdAt.$lte = new Date(endDate);
    }

    const branchFilter: Record<string, any> = {};
    if (branchId) branchFilter.branchId = new Types.ObjectId(branchId);

    const combinedFilter = { ...branchFilter, ...dateFilter };

    const [revenue, expenses, cashPosition, creditOutstanding, marketer, purchases, byBranch, byPaymentMethod, externalData] = await Promise.all([
      this.getRevenue(combinedFilter),
      this.getExpenses(combinedFilter, branchId),
      this.getCashPosition(branchFilter),
      this.getCreditOutstanding(branchFilter),
      this.getMarketerData(branchFilter),
      this.getPurchases(dateFilter),
      this.getByBranch(dateFilter),
      this.getByPaymentMethod(combinedFilter),
      this.microserviceClient.getAllFinancialData().catch((err) => {
        this.logger.warn(`Failed to fetch external service data: ${err.message}`);
        return null;
      }),
    ]);

    const costOfGoods = purchases.receivedValue;
    const grossRevenue = revenue.netRevenue;
    const grossProfit = grossRevenue - costOfGoods;
    const operatingExpenses = expenses.totalExpenses;
    const netProfit = grossProfit - operatingExpenses;
    const margin = grossRevenue > 0 ? (netProfit / grossRevenue) * 100 : 0;

    const externalServices = this.buildExternalServices(revenue, expenses, creditOutstanding, externalData);

    return {
      revenue,
      expenses,
      cashPosition,
      creditOutstanding,
      marketer,
      purchases,
      profitLoss: {
        grossRevenue,
        costOfGoods,
        grossProfit,
        operatingExpenses,
        netProfit,
        margin: Math.round(margin * 100) / 100,
      },
      byBranch,
      byPaymentMethod,
      externalServices,
    };
  }

  private buildExternalServices(
    cafRevenue: UnifiedDashboard['revenue'],
    cafExpenses: UnifiedDashboard['expenses'],
    cafCredit: UnifiedDashboard['creditOutstanding'],
    externalData: { emr: any; lab: any } | null,
  ): UnifiedDashboard['externalServices'] {
    const emrRevenue = externalData?.emr?.paymentStats?.paidRevenue || externalData?.emr?.revenueReport?.totalRevenue || 0;
    const emrExpenses = externalData?.emr?.expenditureSummary?.total || 0;
    const emrOutstanding = externalData?.emr?.paymentStats?.pendingRevenue ||
      (externalData?.emr?.outstanding as any[])?.reduce((sum: number, o: any) => sum + (o.balance || 0), 0) || 0;
    const emrOrders = externalData?.emr?.paymentStats?.byMethod?.reduce((sum: number, m: any) => sum + m.count, 0) || 0;
    const emrByMethod = externalData?.emr?.paymentStats?.byMethod?.map((m: any) => ({
      method: m.method, count: m.count, total: m.total,
    })) || [];

    const labRevenue = externalData?.lab?.paymentStats?.paidRevenue || externalData?.lab?.revenueReport?.totalRevenue || 0;
    const labExpenses = externalData?.lab?.expenditureSummary?.total || 0;
    const labOutstanding = externalData?.lab?.paymentStats?.pendingRevenue ||
      (externalData?.lab?.outstanding as any[])?.reduce((sum: number, o: any) => sum + (o.balance || 0), 0) || 0;
    const labOrders = externalData?.lab?.paymentStats?.byMethod?.reduce((sum: number, m: any) => sum + m.count, 0) || 0;
    const labByMethod = externalData?.lab?.paymentStats?.byMethod?.map((m: any) => ({
      method: m.method, count: m.count, total: m.total,
    })) || [];

    const caf: ServiceFinancials = {
      revenue: cafRevenue.netRevenue,
      expenses: cafExpenses.totalExpenses,
      profit: cafRevenue.netRevenue - cafExpenses.totalExpenses,
      outstanding: cafCredit.totalBalanceDue,
      orders: cafRevenue.salesCount,
      byPaymentMethod: [],
      reconciliation: null,
    };

    const emrRecon = externalData?.emr?.dailyReport?.reconciliation;
    const emrDaily = externalData?.emr?.dailyReport;
    const emr: ServiceFinancials = {
      revenue: emrRevenue,
      expenses: emrExpenses,
      profit: emrRevenue - emrExpenses,
      outstanding: emrOutstanding,
      orders: emrOrders,
      byPaymentMethod: emrByMethod,
      reconciliation: emrDaily ? {
        submitted: !!emrRecon,
        status: emrRecon?.status || 'not_submitted',
        submittedBy: emrRecon?.submittedBy || '',
        notes: emrRecon?.notes || '',
        income: emrDaily.income || { cash: 0, orangeMoney: 0, afrimoney: 0, total: 0 },
        expenditures: emrDaily.expenditures || { cash: 0, orangeMoney: 0, afrimoney: 0, total: 0 },
        netExpected: emrDaily.netExpected || { cash: 0, orangeMoney: 0, afrimoney: 0, total: 0 },
        actual: emrRecon ? { cash: emrRecon.actualCash, orangeMoney: emrRecon.actualOrangeMoney, afrimoney: emrRecon.actualAfrimoney, total: emrRecon.actualTotal } : { cash: 0, orangeMoney: 0, afrimoney: 0, total: 0 },
        variance: emrRecon ? { cash: emrRecon.cashVariance, orangeMoney: emrRecon.orangeMoneyVariance, afrimoney: emrRecon.afrimoneyVariance, total: emrRecon.totalVariance } : { cash: 0, orangeMoney: 0, afrimoney: 0, total: 0 },
      } : null,
    };

    const labRecon = externalData?.lab?.dailyReport?.reconciliation;
    const labDaily = externalData?.lab?.dailyReport;
    const lab: ServiceFinancials = {
      revenue: labRevenue,
      expenses: labExpenses,
      profit: labRevenue - labExpenses,
      outstanding: labOutstanding,
      orders: labOrders,
      byPaymentMethod: labByMethod,
      reconciliation: labDaily ? {
        submitted: !!labRecon,
        status: labRecon?.status || 'not_submitted',
        submittedBy: labRecon?.submittedBy || '',
        notes: labRecon?.notes || '',
        income: labDaily.income || { cash: 0, orangeMoney: 0, afrimoney: 0, total: 0 },
        expenditures: labDaily.expenditures || { cash: 0, orangeMoney: 0, afrimoney: 0, total: 0 },
        netExpected: labDaily.netExpected || { cash: 0, orangeMoney: 0, afrimoney: 0, total: 0 },
        actual: labRecon ? { cash: labRecon.actualCash, orangeMoney: labRecon.actualOrangeMoney, afrimoney: labRecon.actualAfrimoney, total: labRecon.actualTotal } : { cash: 0, orangeMoney: 0, afrimoney: 0, total: 0 },
        variance: labRecon ? { cash: labRecon.cashVariance, orangeMoney: labRecon.orangeMoneyVariance, afrimoney: labRecon.afrimoneyVariance, total: labRecon.totalVariance } : { cash: 0, orangeMoney: 0, afrimoney: 0, total: 0 },
      } : null,
    };

    return {
      caf,
      emr,
      lab,
      combined: {
        totalRevenue: caf.revenue + emr.revenue + lab.revenue,
        totalExpenses: caf.expenses + emr.expenses + lab.expenses,
        totalProfit: caf.profit + emr.profit + lab.profit,
        totalOutstanding: caf.outstanding + emr.outstanding + lab.outstanding,
      },
    };
  }

  private async getRevenue(filter: Record<string, any>): Promise<UnifiedDashboard['revenue']> {
    const [result] = await this.saleModel.aggregate([
      {
        $match: {
          ...filter,
          status: { $ne: 'returned' },
          terminalId: { $nin: ['emr-integration', 'lab-dispensary'] },
        },
      },
      {
        $group: {
          _id: null,
          totalSales: { $sum: '$total' },
          totalReturns: { $sum: '$returnedAmount' },
          salesCount: { $sum: 1 },
        },
      },
    ]).exec();

    const r = result || { totalSales: 0, totalReturns: 0, salesCount: 0 };
    return {
      totalSales: r.totalSales,
      totalRevenue: r.totalSales,
      totalReturns: r.totalReturns,
      netRevenue: r.totalSales - r.totalReturns,
      salesCount: r.salesCount,
    };
  }

  private async getExpenses(filter: Record<string, any>, branchId?: string): Promise<UnifiedDashboard['expenses']> {
    const branchQ: Record<string, any> = branchId ? { branchId: new Types.ObjectId(branchId) } : {};

    const [shiftExpenses, financeExpenses, byCategory] = await Promise.all([
      this.expenseModel.aggregate([
        { $match: { ...branchQ, isDeleted: false, ...filter } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]).exec(),
      this.financeModel.aggregate([
        { $match: { ...branchQ, type: { $in: ['expense', 'cash_out'] }, isDeleted: false, ...filter } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]).exec(),
      this.expenseModel.aggregate([
        { $match: { ...branchQ, isDeleted: false, ...filter } },
        { $group: { _id: '$category', total: { $sum: '$amount' }, count: { $sum: 1 } } },
        { $sort: { total: -1 } },
      ]).exec(),
    ]);

    const se = shiftExpenses[0]?.total || 0;
    const fe = financeExpenses[0]?.total || 0;

    return {
      totalShiftExpenses: se,
      totalFinanceExpenses: fe,
      totalExpenses: se + fe,
      byCategory: byCategory.map((c: any) => ({ category: c._id, total: c.total, count: c.count })),
    };
  }

  private async getCashPosition(branchFilter: Record<string, any>): Promise<UnifiedDashboard['cashPosition']> {
    const [result, openCount, closedCount] = await Promise.all([
      this.shiftModel.aggregate([
        { $match: branchFilter },
        {
          $group: {
            _id: null,
            totalOpeningCash: { $sum: '$openingCash' },
            totalClosingCash: { $sum: { $ifNull: ['$closingCash', 0] } },
            totalExpectedCash: { $sum: { $ifNull: ['$expectedCash', 0] } },
            totalVariance: { $sum: { $ifNull: ['$variance', 0] } },
          },
        },
      ]).exec(),
      this.shiftModel.countDocuments({ ...branchFilter, status: 'open' }).exec(),
      this.shiftModel.countDocuments({ ...branchFilter, status: 'closed' }).exec(),
    ]);

    const r = result[0] || { totalOpeningCash: 0, totalClosingCash: 0, totalExpectedCash: 0, totalVariance: 0 };
    return {
      ...r,
      openShifts: openCount,
      closedShifts: closedCount,
    };
  }

  private async getCreditOutstanding(branchFilter: Record<string, any>): Promise<UnifiedDashboard['creditOutstanding']> {
    const emrLabFilter = { terminalId: { $nin: ['emr-integration', 'lab-dispensary'] } };
    const [result, overdue] = await Promise.all([
      this.saleModel.aggregate([
        { $match: { ...branchFilter, ...emrLabFilter, saleType: 'credit' } },
        {
          $group: {
            _id: null,
            totalCreditSales: { $sum: '$total' },
            totalBalanceDue: { $sum: '$balanceDue' },
            count: { $sum: 1 },
          },
        },
      ]).exec(),
      this.saleModel.aggregate([
        { $match: { ...branchFilter, ...emrLabFilter, saleType: 'credit', paymentStatus: 'overdue' } },
        {
          $group: {
            _id: null,
            overdueCount: { $sum: 1 },
            overdueAmount: { $sum: '$balanceDue' },
          },
        },
      ]).exec(),
    ]);

    const r = result[0] || { totalCreditSales: 0, totalBalanceDue: 0, count: 0 };
    const o = overdue[0] || { overdueCount: 0, overdueAmount: 0 };
    return {
      totalCreditSales: r.totalCreditSales,
      totalBalanceDue: r.totalBalanceDue,
      overdueCount: o.overdueCount,
      overdueAmount: o.overdueAmount,
    };
  }

  private async getMarketerData(branchFilter: Record<string, any>): Promise<UnifiedDashboard['marketer']> {
    const [assigned, sold] = await Promise.all([
      this.assignmentModel.aggregate([
        { $match: { ...branchFilter, status: 'accepted' } },
        {
          $group: {
            _id: null,
            totalAssignedValue: { $sum: { $multiply: ['$assignedQuantity', '$assignedUnitPrice'] } },
            unitsAssigned: { $sum: '$assignedQuantity' },
            unitsRemaining: { $sum: '$remainingQuantity' },
          },
        },
      ]).exec(),
      this.marketerSaleModel.aggregate([
        { $match: branchFilter },
        {
          $group: {
            _id: null,
            totalSoldValue: { $sum: '$totalAmount' },
            unitsSold: { $sum: '$quantity' },
            saleCount: { $sum: 1 },
          },
        },
      ]).exec(),
    ]);

    const a = assigned[0] || { totalAssignedValue: 0, unitsAssigned: 0, unitsRemaining: 0 };
    const s = sold[0] || { totalSoldValue: 0, unitsSold: 0, saleCount: 0 };
    return {
      totalAssignedValue: a.totalAssignedValue,
      totalSoldValue: s.totalSoldValue,
      totalOutstanding: a.totalAssignedValue - s.totalSoldValue,
      unitsAssigned: a.unitsAssigned,
      unitsSold: s.unitsSold,
      unitsRemaining: a.unitsRemaining,
    };
  }

  private async getPurchases(dateFilter: Record<string, any>): Promise<UnifiedDashboard['purchases']> {
    const [result] = await this.purchaseModel.aggregate([
      { $match: { ...dateFilter, status: { $ne: 'cancelled' } } },
      {
        $group: {
          _id: null,
          totalPurchaseValue: { $sum: '$totalAmount' },
          receivedValue: {
            $sum: {
              $reduce: {
                input: '$items',
                initialValue: 0,
                in: { $add: ['$$value', { $multiply: ['$$this.receivedQuantity', '$$this.unitPrice'] }] },
              },
            },
          },
        },
      },
    ]).exec();

    const r = result || { totalPurchaseValue: 0, receivedValue: 0 };
    return {
      totalPurchaseValue: r.totalPurchaseValue,
      receivedValue: r.receivedValue,
      pendingValue: r.totalPurchaseValue - r.receivedValue,
    };
  }

  private async getByBranch(dateFilter: Record<string, any>): Promise<UnifiedDashboard['byBranch']> {
    const [salesByBranch, expensesByBranch] = await Promise.all([
      this.saleModel.aggregate([
        { $match: { ...dateFilter, status: { $ne: 'returned' }, terminalId: { $nin: ['emr-integration', 'lab-dispensary'] } } },
        {
          $group: {
            _id: '$branchId',
            revenue: { $sum: '$total' },
            salesCount: { $sum: 1 },
          },
        },
      ]).exec(),
      this.expenseModel.aggregate([
        { $match: { ...dateFilter, isDeleted: false } },
        {
          $group: {
            _id: '$branchId',
            expenses: { $sum: '$amount' },
          },
        },
      ]).exec(),
    ]);

    const branchMap = new Map<string, { revenue: number; expenses: number; salesCount: number }>();

    for (const s of salesByBranch) {
      const id = s._id?.toString() || 'unknown';
      branchMap.set(id, { revenue: s.revenue, expenses: 0, salesCount: s.salesCount });
    }
    for (const e of expensesByBranch) {
      const id = e._id?.toString() || 'unknown';
      const existing = branchMap.get(id) || { revenue: 0, expenses: 0, salesCount: 0 };
      existing.expenses = e.expenses;
      branchMap.set(id, existing);
    }

    return Array.from(branchMap.entries()).map(([branchId, data]) => ({
      branchId,
      branchName: branchId,
      revenue: data.revenue,
      expenses: data.expenses,
      profit: data.revenue - data.expenses,
      salesCount: data.salesCount,
    }));
  }

  private async getByPaymentMethod(filter: Record<string, any>): Promise<UnifiedDashboard['byPaymentMethod']> {
    const result = await this.saleModel.aggregate([
      { $match: { ...filter, status: { $ne: 'returned' }, terminalId: { $nin: ['emr-integration', 'lab-dispensary'] } } },
      {
        $group: {
          _id: '$paymentMethod',
          count: { $sum: 1 },
          total: { $sum: '$total' },
        },
      },
      { $sort: { total: -1 } },
    ]).exec();

    return result.map((r: any) => ({
      method: r._id,
      count: r.count,
      total: r.total,
    }));
  }
}
