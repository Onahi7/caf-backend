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
import { Branch, BranchDocument } from '../branches/schemas/branch.schema.js';
import { CashEntry, CashEntryDocument } from './schema/cash-entry.schema.js';
import { MicroserviceClientService } from './microservice-client.service.js';
import { CurrencyUtil } from '../common/utils/currency.util.js';

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

export interface ByCurrency {
  SLE: number;
  USD: number;
}

export interface ByCurrencyFormatted {
  SLE: string;
  USD: string;
}

export interface ByBranchSummary {
  branchId: string;
  branchName: string;
  currencyCode: string;
  revenue: number;
  expenses: number;
  profit: number;
  salesCount: number;
  revenueFormatted: string;
  expensesFormatted: string;
  profitFormatted: string;
}

export interface UnifiedDashboard {
  revenue: {
    totalSales: number;
    totalRevenue: number;
    totalReturns: number;
    netRevenue: number;
    salesCount: number;
    revenueByCurrency: ByCurrency;
  };
  revenueByCurrency: ByCurrency;
  revenueByCurrencyFormatted: ByCurrencyFormatted;
  expenses: {
    totalShiftExpenses: number;
    totalFinanceExpenses: number;
    totalExpenses: number;
    byCategory: { category: string; total: number; count: number }[];
    expensesByCurrency: ByCurrency;
  };
  expensesByCurrency: ByCurrency;
  expensesByCurrencyFormatted: ByCurrencyFormatted;
  cashPosition: {
    totalIncome: number;
    totalExpense: number;
    totalTransfer: number;
    totalLoan: number;
    totalSalary: number;
    totalAdvance: number;
    netCash: number;
    byCategory: { category: string; total: number; count: number }[];
    totalOpeningCash: number;
    totalClosingCash: number;
    totalExpectedCash: number;
    totalVariance: number;
    openShifts: number;
    closedShifts: number;
    cashPositionByCurrency: ByCurrency;
  };
  cashPositionByCurrency: ByCurrency;
  cashPositionByCurrencyFormatted: ByCurrencyFormatted;
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
  profitLossByCurrency: ByCurrency;
  profitLossByCurrencyFormatted: ByCurrencyFormatted;
  byBranch: ByBranchSummary[];
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
    @InjectModel(Branch.name) private readonly branchModel: Model<BranchDocument>,
    @InjectModel(CashEntry.name) private readonly cashModel: Model<CashEntryDocument>,
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

    const branches = await this.branchModel
      .find({}, { _id: 1, name: 1, currencyCode: 1 })
      .lean()
      .exec();
    const branchNameMap = new Map<string, string>();
    const branchCurrencyMap = new Map<string, string>();
    for (const b of branches) {
      const id = b._id.toString();
      branchNameMap.set(id, b.name);
      branchCurrencyMap.set(id, b.currencyCode ?? 'SLE');
    }

    const [revenue, expenses, cashPosition, creditOutstanding, marketer, purchases, byBranch, byPaymentMethod, externalData] = await Promise.all([
      this.getRevenue(combinedFilter, branchCurrencyMap),
      this.getExpenses(combinedFilter, branchId, branchCurrencyMap),
      this.getCashPosition(branchFilter, dateFilter, branchCurrencyMap),
      this.getCreditOutstanding(branchFilter),
      this.getMarketerData(branchFilter),
      this.getPurchases(dateFilter, branchFilter),
      this.getByBranch(dateFilter, branchNameMap, branchCurrencyMap),
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

    const profitLossByCurrency: ByCurrency = {
      SLE: revenue.revenueByCurrency.SLE - expenses.expensesByCurrency.SLE,
      USD: revenue.revenueByCurrency.USD - expenses.expensesByCurrency.USD,
    };

    const externalServices = this.buildExternalServices(revenue, expenses, creditOutstanding, cashPosition, byPaymentMethod, externalData);

    return {
      revenue,
      revenueByCurrency: revenue.revenueByCurrency,
      revenueByCurrencyFormatted: this.formatByCurrency(revenue.revenueByCurrency),
      expenses,
      expensesByCurrency: expenses.expensesByCurrency,
      expensesByCurrencyFormatted: this.formatByCurrency(expenses.expensesByCurrency),
      cashPosition,
      cashPositionByCurrency: cashPosition.cashPositionByCurrency,
      cashPositionByCurrencyFormatted: this.formatByCurrency(cashPosition.cashPositionByCurrency),
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
      profitLossByCurrency,
      profitLossByCurrencyFormatted: this.formatByCurrency(profitLossByCurrency),
      byBranch,
      byPaymentMethod,
      externalServices,
    };
  }

  private buildExternalServices(
    cafRevenue: UnifiedDashboard['revenue'],
    cafExpenses: UnifiedDashboard['expenses'],
    cafCredit: UnifiedDashboard['creditOutstanding'],
    cafCashPosition: UnifiedDashboard['cashPosition'],
    cafPaymentMethods: { method: string; count: number; total: number }[],
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

    const cafCashTotal = cafPaymentMethods.filter(m => m.method === 'cash').reduce((s, m) => s + m.total, 0);
    const cafOrangeTotal = cafPaymentMethods.filter(m => m.method === 'orange_money').reduce((s, m) => s + m.total, 0);
    const cafAfriTotal = cafPaymentMethods.filter(m => m.method === 'africell_money').reduce((s, m) => s + m.total, 0);

    const caf: ServiceFinancials = {
      revenue: cafRevenue.netRevenue,
      expenses: cafExpenses.totalExpenses,
      profit: cafRevenue.netRevenue - cafExpenses.totalExpenses,
      outstanding: cafCredit.totalBalanceDue,
      orders: cafRevenue.salesCount,
      byPaymentMethod: cafPaymentMethods,
      reconciliation: {
        submitted: cafCashPosition.closedShifts > 0,
        status: cafCashPosition.totalVariance === 0 ? 'balanced' : 'variance',
        submittedBy: '',
        notes: '',
        income: { cash: cafCashTotal, orangeMoney: cafOrangeTotal, afrimoney: cafAfriTotal, total: cafRevenue.netRevenue },
        expenditures: { cash: cafExpenses.totalExpenses, orangeMoney: 0, afrimoney: 0, total: cafExpenses.totalExpenses },
        netExpected: { cash: cafCashPosition.totalExpectedCash, orangeMoney: 0, afrimoney: 0, total: cafCashPosition.totalExpectedCash },
        actual: { cash: cafCashPosition.totalClosingCash, orangeMoney: 0, afrimoney: 0, total: cafCashPosition.totalClosingCash },
        variance: { cash: cafCashPosition.totalVariance, orangeMoney: 0, afrimoney: 0, total: cafCashPosition.totalVariance },
      },
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

  private emptyByCurrency(): ByCurrency {
    return { SLE: 0, USD: 0 };
  }

  private sumByCurrency<T extends { _id: any }>(
    rows: T[],
    branchCurrencyMap: Map<string, string>,
    getValue: (row: T) => number,
  ): ByCurrency {
    const result = this.emptyByCurrency();
    for (const row of rows) {
      const branchId = row._id?.toString() || 'unknown';
      const code = (branchCurrencyMap.get(branchId) || 'SLE') as keyof ByCurrency;
      result[code] += getValue(row) || 0;
    }
    return result;
  }

  private formatByCurrency(byCurrency: ByCurrency): ByCurrencyFormatted {
    return {
      SLE: CurrencyUtil.format(byCurrency.SLE, 'SLE'),
      USD: CurrencyUtil.format(byCurrency.USD, 'USD'),
    };
  }

  private async getRevenue(
    filter: Record<string, any>,
    branchCurrencyMap: Map<string, string>,
  ): Promise<UnifiedDashboard['revenue']> {
    const [result, byBranch] = await Promise.all([
      this.saleModel.aggregate([
        {
          $match: {
            ...filter,
            status: { $ne: 'returned' },
            terminalId: { $nin: ['emr-integration', 'lab-dispensary', 'staff-advance'] },
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
      ]).exec(),
      this.saleModel.aggregate([
        {
          $match: {
            ...filter,
            status: { $ne: 'returned' },
            terminalId: { $nin: ['emr-integration', 'lab-dispensary', 'staff-advance'] },
          },
        },
        {
          $group: {
            _id: '$branchId',
            totalSales: { $sum: '$total' },
            totalReturns: { $sum: '$returnedAmount' },
            salesCount: { $sum: 1 },
          },
        },
      ]).exec(),
    ]);

    const r = result[0] || { totalSales: 0, totalReturns: 0, salesCount: 0 };
    const revenueByCurrency = this.sumByCurrency(
      byBranch,
      branchCurrencyMap,
      (row: any) => (row.totalSales || 0) - (row.totalReturns || 0),
    );

    return {
      totalSales: r.totalSales,
      totalRevenue: r.totalSales,
      totalReturns: r.totalReturns,
      netRevenue: r.totalSales - r.totalReturns,
      salesCount: r.salesCount,
      revenueByCurrency,
    };
  }

  private async getExpenses(
    filter: Record<string, any>,
    branchId: string | undefined,
    branchCurrencyMap: Map<string, string>,
  ): Promise<UnifiedDashboard['expenses']> {
    const branchQ: Record<string, any> = branchId ? { branchId: new Types.ObjectId(branchId) } : {};

    const [shiftExpenses, financeExpenses, byCategory, shiftExpensesByBranch, financeExpensesByBranch] = await Promise.all([
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
      this.expenseModel.aggregate([
        { $match: { ...branchQ, isDeleted: false, ...filter } },
        { $group: { _id: '$branchId', total: { $sum: '$amount' } } },
      ]).exec(),
      this.financeModel.aggregate([
        { $match: { ...branchQ, type: { $in: ['expense', 'cash_out'] }, isDeleted: false, ...filter } },
        { $group: { _id: '$branchId', total: { $sum: '$amount' } } },
      ]).exec(),
    ]);

    const se = shiftExpenses[0]?.total || 0;
    const fe = financeExpenses[0]?.total || 0;

    const branchExpenses = new Map<string, number>();
    for (const e of shiftExpensesByBranch) {
      const id = e._id?.toString() || 'unknown';
      branchExpenses.set(id, (branchExpenses.get(id) || 0) + (e.total || 0));
    }
    for (const e of financeExpensesByBranch) {
      const id = e._id?.toString() || 'unknown';
      branchExpenses.set(id, (branchExpenses.get(id) || 0) + (e.total || 0));
    }

    const perBranchTotals = Array.from(branchExpenses.entries()).map(([branchId, value]) => ({ _id: branchId, value }));
    const expensesByCurrency = this.sumByCurrency(
      perBranchTotals,
      branchCurrencyMap,
      (row: { _id: string; value: number }) => row.value,
    );

    return {
      totalShiftExpenses: se,
      totalFinanceExpenses: fe,
      totalExpenses: se + fe,
      byCategory: byCategory.map((c: any) => ({ category: c._id, total: c.total, count: c.count })),
      expensesByCurrency,
    };
  }

  private async getCashPosition(
    branchFilter: Record<string, any>,
    dateFilter: Record<string, any> | undefined,
    branchCurrencyMap: Map<string, string>,
  ): Promise<UnifiedDashboard['cashPosition']> {
    const combinedFilter = { ...branchFilter, ...dateFilter };
    const cashEntryFilter: Record<string, any> = { isActive: true, ...branchFilter };
    if (dateFilter?.createdAt) {
      cashEntryFilter.entryDate = dateFilter.createdAt;
    }

    const [result, openCount, closedCount, cashSummary, cashByBranch, byCategory] = await Promise.all([
      this.shiftModel.aggregate([
        { $match: combinedFilter },
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
      this.shiftModel.countDocuments({ ...combinedFilter, status: 'open' }).exec(),
      this.shiftModel.countDocuments({ ...combinedFilter, status: 'closed' }).exec(),
      this.cashModel.aggregate([
        { $match: cashEntryFilter },
        {
          $group: {
            _id: null,
            totalIncome: { $sum: { $cond: [{ $eq: ['$type', 'income'] }, '$amount', 0] } },
            totalExpense: { $sum: { $cond: [{ $eq: ['$type', 'expense'] }, '$amount', 0] } },
            totalTransfer: { $sum: { $cond: [{ $eq: ['$type', 'transfer'] }, '$amount', 0] } },
            totalLoan: { $sum: { $cond: [{ $eq: ['$type', 'loan'] }, '$amount', 0] } },
            totalAdvance: { $sum: { $cond: [{ $eq: ['$type', 'advance'] }, '$amount', 0] } },
            totalSalary: { $sum: { $cond: [{ $eq: ['$type', 'salary'] }, '$amount', 0] } },
          },
        },
      ]).exec(),
      this.cashModel.aggregate([
        { $match: cashEntryFilter },
        {
          $group: {
            _id: '$branchId',
            totalIncome: { $sum: { $cond: [{ $eq: ['$type', 'income'] }, '$amount', 0] } },
            totalExpense: { $sum: { $cond: [{ $eq: ['$type', 'expense'] }, '$amount', 0] } },
            totalTransfer: { $sum: { $cond: [{ $eq: ['$type', 'transfer'] }, '$amount', 0] } },
            totalLoan: { $sum: { $cond: [{ $eq: ['$type', 'loan'] }, '$amount', 0] } },
            totalAdvance: { $sum: { $cond: [{ $eq: ['$type', 'advance'] }, '$amount', 0] } },
            totalSalary: { $sum: { $cond: [{ $eq: ['$type', 'salary'] }, '$amount', 0] } },
          },
        },
      ]).exec(),
      this.cashModel.aggregate([
        { $match: cashEntryFilter },
        {
          $group: {
            _id: '$category',
            total: { $sum: '$amount' },
            count: { $sum: 1 },
          },
        },
        { $sort: { total: -1 } },
      ]).exec(),
    ]);

    const r = result[0] || { totalOpeningCash: 0, totalClosingCash: 0, totalExpectedCash: 0, totalVariance: 0 };
    const s = cashSummary[0] || { totalIncome: 0, totalExpense: 0, totalTransfer: 0, totalLoan: 0, totalAdvance: 0, totalSalary: 0 };
    const netCash = s.totalIncome - s.totalExpense - s.totalTransfer - s.totalLoan - s.totalAdvance - s.totalSalary;

    const netCashByBranch = new Map<string, number>();
    for (const row of cashByBranch) {
      const id = row._id?.toString() || 'unknown';
      const net =
        (row.totalIncome || 0) -
        (row.totalExpense || 0) -
        (row.totalTransfer || 0) -
        (row.totalLoan || 0) -
        (row.totalAdvance || 0) -
        (row.totalSalary || 0);
      netCashByBranch.set(id, (netCashByBranch.get(id) || 0) + net);
    }
    const perBranchNetCash = Array.from(netCashByBranch.entries()).map(([branchId, value]) => ({ _id: branchId, value }));
    const cashPositionByCurrency = this.sumByCurrency(
      perBranchNetCash,
      branchCurrencyMap,
      (row: { _id: string; value: number }) => row.value,
    );

    return {
      totalIncome: s.totalIncome,
      totalExpense: s.totalExpense,
      totalTransfer: s.totalTransfer,
      totalLoan: s.totalLoan,
      totalSalary: s.totalSalary,
      totalAdvance: s.totalAdvance,
      netCash,
      byCategory: byCategory.map((c: any) => ({ category: c._id, total: c.total, count: c.count })),
      totalOpeningCash: r.totalOpeningCash,
      totalClosingCash: r.totalClosingCash,
      totalExpectedCash: r.totalExpectedCash,
      totalVariance: r.totalVariance,
      openShifts: openCount,
      closedShifts: closedCount,
      cashPositionByCurrency,
    };
  }

  private async getCreditOutstanding(branchFilter: Record<string, any>): Promise<UnifiedDashboard['creditOutstanding']> {
    const emrLabFilter = { terminalId: { $nin: ['emr-integration', 'lab-dispensary', 'staff-advance'] } };
    const openCreditFilter = {
      ...branchFilter,
      ...emrLabFilter,
      saleType: 'credit',
      paymentStatus: { $in: ['unpaid', 'partial', 'overdue'] },
      balanceDue: { $gt: 0 },
    };
    const [result, overdue] = await Promise.all([
      this.saleModel.aggregate([
        { $match: openCreditFilter },
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
        {
          $match: {
            ...openCreditFilter,
            dueDate: { $lt: new Date() },
          },
        },
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

  async getReceivablesAging(branchFilter: Record<string, any>, asOf: Date = new Date()): Promise<{
    asOf: Date;
    totalOutstanding: number;
    openInvoiceCount: number;
    buckets: {
      bucket: string;
      label: string;
      range: { from: number; to: number | null };
      count: number;
      amount: number;
      totalOutstanding: number;
    }[];
  }> {
    const emrLabFilter = { terminalId: { $nin: ['emr-integration', 'lab-dispensary', 'staff-advance'] } };
    const matchBase = {
      ...branchFilter,
      ...emrLabFilter,
      saleType: 'credit',
      paymentStatus: { $in: ['unpaid', 'partial', 'overdue'] },
      balanceDue: { $gt: 0 },
    };

    const ranges = [
      { bucket: '0_30', label: '0-30 days', min: 0, max: 30 },
      { bucket: '31_60', label: '31-60 days', min: 31, max: 60 },
      { bucket: '61_90', label: '61-90 days', min: 61, max: 90 },
      { bucket: '90_plus', label: '90+ days', min: 91, max: null as number | null },
    ];

    const buckets = await Promise.all(
      ranges.map(async (range) => {
        const match = { ...matchBase };
        const daysOldExpr = {
          $divide: [
            { $subtract: [asOf, { $ifNull: ['$dueDate', '$createdAt'] }] },
            1000 * 60 * 60 * 24,
          ],
        };
        if (range.max === null) {
          (match as any).$expr = { $gte: [daysOldExpr, range.min] };
        } else {
          (match as any).$expr = { $and: [{ $gte: [daysOldExpr, range.min] }, { $lte: [daysOldExpr, range.max] }] };
        }
        const [result] = await this.saleModel.aggregate([
          { $match: match },
          {
            $group: {
              _id: null,
              count: { $sum: 1 },
              amount: { $sum: '$balanceDue' },
            },
          },
        ]).exec();
        return {
          bucket: range.bucket,
          label: range.label,
          range: { from: range.min, to: range.max },
          count: result?.count ?? 0,
          amount: result?.amount ?? 0,
          totalOutstanding: result?.amount ?? 0,
        };
      }),
    );

    const totalOutstanding = buckets.reduce((s, b) => s + b.amount, 0);
    const openInvoiceCount = buckets.reduce((s, b) => s + b.count, 0);

    return { asOf, totalOutstanding, openInvoiceCount, buckets };
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

  private async getPurchases(dateFilter: Record<string, any>, branchFilter?: Record<string, any>): Promise<UnifiedDashboard['purchases']> {
    const combinedFilter = { ...dateFilter, ...branchFilter, status: { $ne: 'cancelled' } };
    const [result] = await this.purchaseModel.aggregate([
      { $match: combinedFilter },
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

  private async getByBranch(
    dateFilter: Record<string, any>,
    branchNameMap: Map<string, string>,
    branchCurrencyMap: Map<string, string>,
  ): Promise<UnifiedDashboard['byBranch']> {
    const [salesByBranch, expensesByBranch, financeExpensesByBranch] = await Promise.all([
      this.saleModel.aggregate([
        { $match: { ...dateFilter, status: { $ne: 'returned' }, terminalId: { $nin: ['emr-integration', 'lab-dispensary', 'staff-advance'] } } },
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
      this.financeModel.aggregate([
        { $match: { ...dateFilter, type: { $in: ['expense', 'cash_out'] }, isDeleted: false } },
        {
          $group: {
            _id: '$branchId',
            expenses: { $sum: '$amount' },
          },
        },
      ]).exec(),
    ]);

    const financeExpenseMap = new Map<string, number>();
    for (const f of financeExpensesByBranch) {
      financeExpenseMap.set(f._id?.toString() || 'unknown', f.expenses || 0);
    }

    const branchMap = new Map<string, { revenue: number; expenses: number; salesCount: number }>();

    for (const s of salesByBranch) {
      const id = s._id?.toString() || 'unknown';
      branchMap.set(id, { revenue: s.revenue, expenses: 0, salesCount: s.salesCount });
    }
    for (const e of expensesByBranch) {
      const id = e._id?.toString() || 'unknown';
      const existing = branchMap.get(id) || { revenue: 0, expenses: 0, salesCount: 0 };
      existing.expenses = (e.expenses || 0) + (financeExpenseMap.get(id) || 0);
      branchMap.set(id, existing);
    }
    // Include branches that only have finance expenses.
    for (const [id, financeExp] of financeExpenseMap.entries()) {
      if (!branchMap.has(id)) {
        branchMap.set(id, { revenue: 0, expenses: financeExp, salesCount: 0 });
      }
    }

    return Array.from(branchMap.entries()).map(([branchId, data]) => {
      const currencyCode = branchCurrencyMap.get(branchId) || 'SLE';
      const profit = data.revenue - data.expenses;
      return {
        branchId,
        branchName: branchNameMap.get(branchId) || branchId,
        currencyCode,
        revenue: data.revenue,
        expenses: data.expenses,
        profit,
        salesCount: data.salesCount,
        revenueFormatted: CurrencyUtil.format(data.revenue, currencyCode),
        expensesFormatted: CurrencyUtil.format(data.expenses, currencyCode),
        profitFormatted: CurrencyUtil.format(profit, currencyCode),
      };
    });
  }

  private async getByPaymentMethod(filter: Record<string, any>): Promise<UnifiedDashboard['byPaymentMethod']> {
    const result = await this.saleModel.aggregate([
      { $match: { ...filter, status: { $ne: 'returned' }, terminalId: { $nin: ['emr-integration', 'lab-dispensary', 'staff-advance'] } } },
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

  async getCrossCheckReconciliation(_branchId?: string, date?: string): Promise<{
    emr: { cafExpected: number; emrReported: number; variance: number; status: string };
    lab: { cafExpected: number; labReported: number; variance: number; status: string };
    timestamp: string;
  }> {
    const targetDate = date || new Date().toISOString().slice(0, 10);
    const externalData = await this.microserviceClient.getAllFinancialData().catch(() => null);

    const cafEmrSales = await this.saleModel.aggregate([
      {
        $match: {
          terminalId: 'emr-integration',
          createdAt: {
            $gte: new Date(targetDate),
            $lt: new Date(new Date(targetDate).getTime() + 86400000),
          },
        },
      },
      { $group: { _id: null, total: { $sum: '$total' } } },
    ]).exec();

    const cafLabSales = await this.saleModel.aggregate([
      {
        $match: {
          terminalId: 'lab-dispensary',
          createdAt: {
            $gte: new Date(targetDate),
            $lt: new Date(new Date(targetDate).getTime() + 86400000),
          },
        },
      },
      { $group: { _id: null, total: { $sum: '$total' } } },
    ]).exec();

    const cafEmrRevenue = cafEmrSales[0]?.total || 0;
    const cafLabRevenue = cafLabSales[0]?.total || 0;
    const emrReported = externalData?.emr?.paymentStats?.paidRevenue || externalData?.emr?.dailyReport?.income?.total || 0;
    const labReported = externalData?.lab?.paymentStats?.paidRevenue || externalData?.lab?.dailyReport?.income?.total || 0;

    const emrVariance = cafEmrRevenue - emrReported;
    const labVariance = cafLabRevenue - labReported;

    return {
      emr: {
        cafExpected: cafEmrRevenue,
        emrReported,
        variance: emrVariance,
        status: Math.abs(emrVariance) < 1 ? 'matched' : emrVariance > 0 ? 'caf_higher' : 'emr_higher',
      },
      lab: {
        cafExpected: cafLabRevenue,
        labReported,
        variance: labVariance,
        status: Math.abs(labVariance) < 1 ? 'matched' : labVariance > 0 ? 'caf_higher' : 'lab_higher',
      },
      timestamp: new Date().toISOString(),
    };
  }
}
