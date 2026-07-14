import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import {
  Reconciliation, ReconciliationDocument, ReconciliationStatus,
} from './schema/reconciliation.schema.js';
import {
  Salary, SalaryDocument, SalaryStatus,
} from './schema/salary.schema.js';
import {
  CashEntry, CashEntryDocument, CashEntryType, CashEntryCategory,
} from './schema/cash-entry.schema.js';
import { EmployeeAdvanceService } from './employee-advance.service.js';
import { CreateReconciliationDto, ReviewReconciliationDto, ReconciliationFilterDto } from './dto/reconciliation.dto.js';
import { CreateSalaryDto, UpdateSalaryDto, SalaryFilterDto } from './dto/salary.dto.js';
import { CreateCashEntryDto, CashEntryFilterDto } from './dto/cash-entry.dto.js';
import { DailyFinancePushDto } from './dto/daily-finance-push.dto.js';
import { EventsService } from '../websocket/events.service.js';


@Injectable()
export class FinanceManagerService {
  private readonly logger = new Logger(FinanceManagerService.name);

  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Reconciliation.name) private readonly reconModel: Model<ReconciliationDocument>,
    @InjectModel(Salary.name) private readonly salaryModel: Model<SalaryDocument>,
    @InjectModel(CashEntry.name) private readonly cashModel: Model<CashEntryDocument>,
    private readonly advanceService: EmployeeAdvanceService,
    private readonly eventsService: EventsService,
  ) {}

  // --- Reconciliation ---------------------------------------
  async createReconciliation(dto: CreateReconciliationDto, userId: string): Promise<ReconciliationDocument> {
    const discrepancy = dto.actualCash - dto.expectedCash;

    const createData: Record<string, any> = {
      ...dto,
      items: dto.items || [],
      discrepancy,
      hasDiscrepancy: Math.abs(discrepancy) > 0.01,
      createdBy: new Types.ObjectId(userId),
    };

    if (dto.expectedPaymentBreakdown && dto.actualPaymentBreakdown) {
      createData.expectedPaymentBreakdown = dto.expectedPaymentBreakdown;
      createData.actualPaymentBreakdown = dto.actualPaymentBreakdown;
      createData.paymentDiscrepancy = {
        cash: (dto.actualPaymentBreakdown.cash || 0) - (dto.expectedPaymentBreakdown.cash || 0),
        orangeMoney: (dto.actualPaymentBreakdown.orangeMoney || 0) - (dto.expectedPaymentBreakdown.orangeMoney || 0),
        afrimoney: (dto.actualPaymentBreakdown.afrimoney || 0) - (dto.expectedPaymentBreakdown.afrimoney || 0),
      };
    }

    const recon = await this.reconModel.create(createData);
    this.logger.log(`Reconciliation created: ${dto.source} ${dto.period} for branch ${dto.branchId}`);

    const absDisc = Math.abs(discrepancy);
    if (absDisc > 1) {
      const severity = this.varianceSeverity(absDisc);
      this.eventsService.emitReconciliationVariance({
        reconciliationId: recon._id.toString(),
        branchId: recon.branchId.toString(),
        period: recon.period,
        source: recon.source,
        expectedCash: recon.expectedCash,
        actualCash: recon.actualCash,
        discrepancy: recon.discrepancy,
        severity,
        createdBy: userId,
        timestamp: new Date(),
      });
    }
    return recon;
  }

  private varianceSeverity(abs: number): 'low' | 'medium' | 'high' | 'critical' {
    if (abs >= 10000) return 'critical';
    if (abs >= 1000) return 'high';
    if (abs >= 100) return 'medium';
    return 'low';
  }

  async findAllReconciliations(filter: ReconciliationFilterDto): Promise<ReconciliationDocument[]> {
    const query: Record<string, any> = {};
    if (filter.branchId) query.branchId = new Types.ObjectId(filter.branchId);
    if (filter.source) query.source = filter.source;
    if (filter.period) query.period = filter.period;
    if (filter.status) query.status = filter.status;
    return this.reconModel.find(query).sort({ createdAt: -1 }).populate('createdBy', 'firstName lastName').populate('reviewedBy', 'firstName lastName').populate('branchId', 'name').exec();
  }

  async findReconciliationById(id: string): Promise<ReconciliationDocument> {
    const recon = await this.reconModel.findById(id).populate('createdBy', 'firstName lastName').populate('reviewedBy', 'firstName lastName').populate('branchId', 'name').exec();
    if (!recon) throw new NotFoundException(`Reconciliation ${id} not found`);
    return recon;
  }

  async reviewReconciliation(id: string, dto: ReviewReconciliationDto, userId: string): Promise<ReconciliationDocument> {
    const recon = await this.findReconciliationById(id);
    if (recon.status !== ReconciliationStatus.PENDING) {
      throw new BadRequestException(`Cannot review reconciliation in ${recon.status} status`);
    }
    recon.status = dto.status;
    recon.reviewedBy = new Types.ObjectId(userId);
    recon.reviewedAt = new Date();
    if (dto.reviewNotes) recon.reviewNotes = dto.reviewNotes;

    if (dto.actualCash !== undefined) {
      recon.actualCash = dto.actualCash;
      recon.discrepancy = dto.actualCash - recon.expectedCash;
      recon.hasDiscrepancy = Math.abs(recon.discrepancy) > 0.01;
    }

    if (dto.actualPaymentBreakdown) {
      recon.actualPaymentBreakdown = dto.actualPaymentBreakdown as any;
      const expected = recon.expectedPaymentBreakdown || { cash: 0, orangeMoney: 0, afrimoney: 0 };
      recon.paymentDiscrepancy = {
        cash: (dto.actualPaymentBreakdown.cash || 0) - (expected.cash || 0),
        orangeMoney: (dto.actualPaymentBreakdown.orangeMoney || 0) - (expected.orangeMoney || 0),
        afrimoney: (dto.actualPaymentBreakdown.afrimoney || 0) - (expected.afrimoney || 0),
      } as any;
    }

    return recon.save();
  }

  async getReconciliationStats(branchId?: string): Promise<{
    pending: number;
    approved: number;
    rejected: number;
    totalDiscrepancy: number;
  }> {
    const query: Record<string, any> = {};
    if (branchId) query.branchId = new Types.ObjectId(branchId);

    const allStats = await this.reconModel.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          pending: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
          approved: { $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] } },
          rejected: { $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] } },
          totalDiscrepancy: { $sum: '$discrepancy' },
        },
      },
    ]).exec();

    return allStats[0] || { pending: 0, approved: 0, rejected: 0, totalDiscrepancy: 0 };
  }

  // --- Salary -----------------------------------------------
  async createSalary(dto: CreateSalaryDto, userId: string): Promise<SalaryDocument> {
    const netSalary = dto.baseSalary + (dto.allowances || 0) - (dto.deductions || 0);
    const salary = await this.salaryModel.create({
      ...dto,
      netSalary,
      createdBy: new Types.ObjectId(userId),
    });
    this.logger.log(`Salary record created for employee ${dto.employeeId}, period ${dto.period}`);
    return salary;
  }

  async findAllSalaries(filter: SalaryFilterDto): Promise<SalaryDocument[]> {
    const query: Record<string, any> = {};
    if (filter.branchId) query.branchId = new Types.ObjectId(filter.branchId);
    if (filter.employeeId) query.employeeId = new Types.ObjectId(filter.employeeId);
    if (filter.period) query.period = filter.period;
    if (filter.status) query.status = filter.status;
    return this.salaryModel.find(query).sort({ createdAt: -1 }).populate('employeeId', 'firstName lastName username').populate('approvedBy', 'firstName lastName').exec();
  }

  async findSalaryById(id: string): Promise<SalaryDocument> {
    const salary = await this.salaryModel.findById(id).populate('employeeId', 'firstName lastName username').populate('approvedBy', 'firstName lastName').exec();
    if (!salary) throw new NotFoundException(`Salary ${id} not found`);
    return salary;
  }

  async updateSalary(id: string, dto: UpdateSalaryDto): Promise<SalaryDocument> {
    const salary = await this.findSalaryById(id);
    if (salary.status === SalaryStatus.PAID) {
      throw new BadRequestException('Cannot update a paid salary');
    }
    if (dto.baseSalary !== undefined) salary.baseSalary = dto.baseSalary;
    if (dto.allowances !== undefined) salary.allowances = dto.allowances;
    if (dto.deductions !== undefined) salary.deductions = dto.deductions;
    if (dto.paymentMethod) salary.paymentMethod = dto.paymentMethod;
    if (dto.paymentDate) salary.paymentDate = new Date(dto.paymentDate);
    if (dto.notes) salary.notes = dto.notes;
    salary.netSalary = salary.baseSalary + salary.allowances - salary.deductions;
    return salary.save();
  }

  async approveSalary(id: string, userId: string): Promise<SalaryDocument> {
    const salary = await this.findSalaryById(id);
    if (salary.status !== SalaryStatus.DRAFT && salary.status !== SalaryStatus.PENDING_APPROVAL) {
      throw new BadRequestException(`Cannot approve salary in ${salary.status} status`);
    }
    salary.status = SalaryStatus.APPROVED;
    salary.approvedBy = new Types.ObjectId(userId);
    salary.approvedAt = new Date();
    return salary.save();
  }

  async markSalaryPaid(id: string, paymentDate?: string, userId?: string): Promise<SalaryDocument> {
    const salary = await this.findSalaryById(id);
    if (salary.status !== SalaryStatus.APPROVED) {
      throw new BadRequestException('Salary must be approved before marking as paid');
    }

    const actorId = userId ?? salary.approvedBy?.toString() ?? salary.createdBy.toString();

    const deduction = await this.advanceService.recordSalaryDeduction(
      salary.employeeId.toString(),
      salary.branchId.toString(),
      salary.period,
      id,
      salary.netSalary,
    );

    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      if (deduction.totalDeducted > 0) {
        const netPayable = salary.netSalary;
        const actualPayout = Math.max(0, netPayable - deduction.totalDeducted);
        salary.deductions = (salary.deductions || 0) + deduction.totalDeducted;
        salary.netSalary = actualPayout;

        this.logger.log(
          `Salary ${id} auto-deducted ${deduction.totalDeducted} from ${deduction.advancesUpdated} advance(s). Net payout: ${actualPayout}`,
        );
      }

      salary.status = SalaryStatus.PAID;
      salary.paymentDate = paymentDate ? new Date(paymentDate) : new Date();
      const saved = await salary.save({ session });

      await this.advanceService.applySalaryDeduction(
        salary.employeeId.toString(),
        salary.branchId.toString(),
        deduction,
        id,
        actorId,
        session,
      );

      await session.commitTransaction();
      return saved;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  async getSalaryStats(branchId?: string, period?: string): Promise<{
    totalEmployees: number;
    totalBase: number;
    totalAllowances: number;
    totalDeductions: number;
    totalNet: number;
    pendingCount: number;
    paidCount: number;
  }> {
    const query: Record<string, any> = {};
    if (branchId) query.branchId = new Types.ObjectId(branchId);
    if (period) query.period = period;

    const [stats] = await this.salaryModel.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalEmployees: { $sum: 1 },
          totalBase: { $sum: '$baseSalary' },
          totalAllowances: { $sum: '$allowances' },
          totalDeductions: { $sum: '$deductions' },
          totalNet: { $sum: '$netSalary' },
          pendingCount: { $sum: { $cond: [{ $in: ['$status', ['draft', 'pending_approval']] }, 1, 0] } },
          paidCount: { $sum: { $cond: [{ $eq: ['$status', 'paid'] }, 1, 0] } },
        },
      },
    ]).exec();

    return stats[0] || { totalEmployees: 0, totalBase: 0, totalAllowances: 0, totalDeductions: 0, totalNet: 0, pendingCount: 0, paidCount: 0 };
  }

  async previewSalaryPayroll(id: string): Promise<{
    salaryId: string;
    employeeId: string;
    branchId: string;
    period: string;
    baseSalary: number;
    allowances: number;
    manualDeductions: number;
    advanceDeduction: number;
    netSalary: number;
    actualPayout: number;
    status: SalaryStatus;
    advanceDetails: {
      advanceId: string;
      referenceNumber: string;
      amountDeducted: number;
    }[];
  }> {
    const salary = await this.findSalaryById(id);
    const deduction = await this.advanceService.recordSalaryDeduction(
      salary.employeeId.toString(),
      salary.branchId.toString(),
      salary.period,
      id,
      Math.max(0, salary.baseSalary + (salary.allowances || 0) - (salary.deductions || 0)),
    );

    const baseNet = salary.baseSalary + (salary.allowances || 0) - (salary.deductions || 0);
    const actualPayout = Math.max(0, baseNet - deduction.totalDeducted);

    return {
      salaryId: salary._id.toString(),
      employeeId: salary.employeeId.toString(),
      branchId: salary.branchId.toString(),
      period: salary.period,
      baseSalary: salary.baseSalary,
      allowances: salary.allowances || 0,
      manualDeductions: salary.deductions || 0,
      advanceDeduction: deduction.totalDeducted,
      netSalary: baseNet,
      actualPayout,
      status: salary.status,
      advanceDetails: deduction.details,
    };
  }

  // --- Cash Entries -----------------------------------------
  async createCashEntry(dto: CreateCashEntryDto, userId: string): Promise<CashEntryDocument> {
    const entry = await this.cashModel.create({
      ...dto,
      entryDate: dto.entryDate ? new Date(dto.entryDate) : new Date(),
      recordedBy: new Types.ObjectId(userId),
    });
    this.logger.log(`Cash entry created: ${dto.type} ${dto.category} $${dto.amount}`);
    return entry;
  }

  async findAllCashEntries(filter: CashEntryFilterDto): Promise<{ data: CashEntryDocument[]; total: number }> {
    const query: Record<string, any> = { isActive: true };
    if (filter.branchId) query.branchId = new Types.ObjectId(filter.branchId);
    if (filter.type) query.type = filter.type;
    if (filter.category) query.category = filter.category;
    if (filter.startDate || filter.endDate) {
      query.entryDate = {};
      if (filter.startDate) query.entryDate.$gte = new Date(filter.startDate);
      if (filter.endDate) query.entryDate.$lte = new Date(filter.endDate);
    }
    const page = parseInt(filter.page || '1', 10);
    const limit = parseInt(filter.limit || '50', 10);
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.cashModel.find(query).sort({ entryDate: -1 }).skip(skip).limit(limit).populate('recordedBy', 'firstName lastName').exec(),
      this.cashModel.countDocuments(query).exec(),
    ]);
    return { data, total };
  }

  async findCashEntryById(id: string): Promise<CashEntryDocument> {
    const entry = await this.cashModel.findById(id).populate('recordedBy', 'firstName lastName').exec();
    if (!entry) throw new NotFoundException(`Cash entry ${id} not found`);
    return entry;
  }

  async softDeleteCashEntry(id: string): Promise<CashEntryDocument> {
    const entry = await this.findCashEntryById(id);
    entry.isActive = false;
    return entry.save();
  }

  async getCashSummary(branchId?: string, startDate?: string, endDate?: string): Promise<{
    totalIncome: number;
    totalExpense: number;
    totalTransfer: number;
    totalLoan: number;
    totalAdvance: number;
    totalSalary: number;
    netCash: number;
    byCategory: { category: string; total: number; count: number }[];
  }> {
    const matchQuery: Record<string, any> = { isActive: true };
    if (branchId) matchQuery.branchId = new Types.ObjectId(branchId);
    if (startDate || endDate) {
      matchQuery.entryDate = {};
      if (startDate) matchQuery.entryDate.$gte = new Date(startDate);
      if (endDate) matchQuery.entryDate.$lte = new Date(endDate);
    }

    const [summary] = await this.cashModel.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          totalIncome: { $sum: { $cond: [{ $eq: ['$type', 'income'] }, '$amount', 0] } },
          totalExpense: { $sum: { $cond: [{ $eq: ['$type', 'expense'] }, '$amount', 0] } },
          totalTransfer: { $sum: { $cond: [{ $eq: ['$type', 'transfer'] }, '$amount', 0] } },
          totalLoan: { $sum: { $cond: [{ $eq: ['$type', 'loan'] }, '$amount', 0] } },
          totalAdvance: { $sum: { $cond: [{ $eq: ['$type', 'advance'] }, '$amount', 0] } },
          totalSalary: { $sum: { $cond: [{ $eq: ['$type', 'salary'] }, '$amount', 0] } },
          signedCash: {
            $sum: {
              $cond: [
                { $eq: ['$cashFlowDirection', 'inflow'] },
                '$amount',
                {
                  $cond: [
                    { $eq: ['$cashFlowDirection', 'outflow'] },
                    { $multiply: ['$amount', -1] },
                    { $cond: [{ $eq: ['$type', 'income'] }, '$amount', { $multiply: ['$amount', -1] }] },
                  ],
                },
              ],
            },
          },
        },
      },
    ]).exec();

    const byCategory = await this.cashModel.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: '$category',
          total: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
      { $sort: { total: -1 } },
    ]).exec();

    const s = summary[0] || { totalIncome: 0, totalExpense: 0, totalTransfer: 0, totalLoan: 0, totalAdvance: 0, totalSalary: 0 };
    return {
      ...s,
      netCash: s.signedCash ?? 0,
      byCategory: byCategory.map((c: any) => ({ category: c._id, total: c.total, count: c.count })),
    };
  }

  // --- Dashboard --------------------------------------------
  async getDashboard(branchId: string): Promise<{
    reconciliation: { pending: number; approved: number; rejected: number; totalDiscrepancy: number };
    salary: { totalEmployees: number; totalNet: number; pendingCount: number; paidCount: number };
    cash: { totalIncome: number; totalExpense: number; netCash: number };
    recentReconciliations: ReconciliationDocument[];
    recentCashEntries: CashEntryDocument[];
  }> {
    const defaultRecon = { pending: 0, approved: 0, rejected: 0, totalDiscrepancy: 0 };
    const defaultSalary = { totalEmployees: 0, totalBase: 0, totalAllowances: 0, totalDeductions: 0, totalNet: 0, pendingCount: 0, paidCount: 0 };
    const defaultCash = { totalIncome: 0, totalExpense: 0, totalTransfer: 0, totalLoan: 0, totalAdvance: 0, totalSalary: 0, netCash: 0, byCategory: [] as any[] };

    const [reconciliation, salary, cash, recentReconciliations, recentCashEntries] = await Promise.all([
      this.getReconciliationStats(branchId).catch((e) => { this.logger.warn(`Reconciliation stats failed: ${e.message}`); return defaultRecon; }),
      this.getSalaryStats(branchId).catch((e) => { this.logger.warn(`Salary stats failed: ${e.message}`); return defaultSalary; }),
      this.getCashSummary(branchId).catch((e) => { this.logger.warn(`Cash summary failed: ${e.message}`); return defaultCash; }),
      this.reconModel.find({ branchId: new Types.ObjectId(branchId) }).sort({ createdAt: -1 }).limit(5).exec().catch((e) => { this.logger.warn(`Recent reconciliations failed: ${e.message}`); return []; }),
      this.cashModel.find({ branchId: new Types.ObjectId(branchId), isActive: true }).sort({ entryDate: -1 }).limit(10).exec().catch((e) => { this.logger.warn(`Recent cash entries failed: ${e.message}`); return []; }),
    ]);
    return { reconciliation, salary, cash, recentReconciliations, recentCashEntries };
  }

  async receiveFinancePush(dto: DailyFinancePushDto, userId: string): Promise<{
    revenueEntry: CashEntryDocument;
    expenseEntry: CashEntryDocument | null;
    summary: {
      source: string;
      date: string;
      totalRevenue: number;
      totalExpenses: number;
      netIncome: number;
      cashCollected: number;
      orangeMoneyCollected: number;
      afrimoneyCollected: number;
      outstandingBalance: number;
      orderCount: number;
    };
  }> {
    const source = dto.source?.toLowerCase();
    if (!['emr', 'lab'].includes(source)) {
      throw new BadRequestException('Source must be "emr" or "lab"');
    }

    const branchObjectId = new Types.ObjectId(dto.branchId);
    const entryDate = new Date(dto.date);
    const sourceLabel = source.toUpperCase();

    const revenueEntry = await this.cashModel.create({
      type: CashEntryType.INCOME,
      category: CashEntryCategory.SALES,
      branchId: branchObjectId,
      amount: dto.totalRevenue || 0,
      description: `${sourceLabel} Daily Revenue - ${dto.date}`,
      notes: [
        dto.notes?.slice(0, 500),
        `Payment breakdown: Cash=${dto.cashCollected || 0}, Orange=${dto.orangeMoneyCollected || 0}, Afri=${dto.afrimoneyCollected || 0}`,
        `Orders: ${dto.orderCount || 0}, Outstanding: ${dto.outstandingBalance || 0}`,
        dto.submittedBy ? `Submitted by: ${dto.submittedBy}` : undefined,
      ].filter(Boolean).join(' | '),
      recordedBy: new Types.ObjectId(userId),
      entryDate,
    });

    let expenseEntry: CashEntryDocument | null = null;
    if (dto.totalExpenses && dto.totalExpenses > 0) {
      expenseEntry = await this.cashModel.create({
        type: CashEntryType.EXPENSE,
        category: CashEntryCategory.OTHER,
        branchId: branchObjectId,
        amount: dto.totalExpenses,
        description: `${sourceLabel} Daily Expenses - ${dto.date}`,
        notes: `Net income: ${dto.netIncome || 0}`,
        recordedBy: new Types.ObjectId(userId),
        entryDate,
      });
    }

    this.logger.log(
      `Finance push received from ${sourceLabel} for ${dto.date}: Revenue=${dto.totalRevenue}, Expenses=${dto.totalExpenses}, Orders=${dto.orderCount}`,
    );

    return {
      revenueEntry,
      expenseEntry,
      summary: {
        source,
        date: dto.date,
        totalRevenue: dto.totalRevenue || 0,
        totalExpenses: dto.totalExpenses || 0,
        netIncome: dto.netIncome || 0,
        cashCollected: dto.cashCollected || 0,
        orangeMoneyCollected: dto.orangeMoneyCollected || 0,
        afrimoneyCollected: dto.afrimoneyCollected || 0,
        outstandingBalance: dto.outstandingBalance || 0,
        orderCount: dto.orderCount || 0,
      },
    };
  }
}
