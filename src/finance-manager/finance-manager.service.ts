import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Reconciliation, ReconciliationDocument, ReconciliationStatus,
} from './schema/reconciliation.schema.js';
import {
  Salary, SalaryDocument, SalaryStatus,
} from './schema/salary.schema.js';
import {
  CashEntry, CashEntryDocument,
} from './schema/cash-entry.schema.js';
import { CreateReconciliationDto, ReviewReconciliationDto, ReconciliationFilterDto } from './dto/reconciliation.dto.js';
import { CreateSalaryDto, UpdateSalaryDto, SalaryFilterDto } from './dto/salary.dto.js';
import { CreateCashEntryDto, CashEntryFilterDto } from './dto/cash-entry.dto.js';


@Injectable()
export class FinanceManagerService {
  private readonly logger = new Logger(FinanceManagerService.name);

  constructor(
    @InjectModel(Reconciliation.name) private readonly reconModel: Model<ReconciliationDocument>,
    @InjectModel(Salary.name) private readonly salaryModel: Model<SalaryDocument>,
    @InjectModel(CashEntry.name) private readonly cashModel: Model<CashEntryDocument>,
  ) {}

  // ─── Reconciliation ───────────────────────────────────────
  async createReconciliation(dto: CreateReconciliationDto, userId: string): Promise<ReconciliationDocument> {
    const discrepancy = dto.actualCash - dto.expectedCash;
    const recon = await this.reconModel.create({
      ...dto,
      items: dto.items || [],
      discrepancy,
      hasDiscrepancy: Math.abs(discrepancy) > 0.01,
      createdBy: new Types.ObjectId(userId),
    });
    this.logger.log(`Reconciliation created: ${dto.source} ${dto.period} for branch ${dto.branchId}`);
    return recon;
  }

  async findAllReconciliations(filter: ReconciliationFilterDto): Promise<ReconciliationDocument[]> {
    const query: Record<string, any> = {};
    if (filter.branchId) query.branchId = new Types.ObjectId(filter.branchId);
    if (filter.source) query.source = filter.source;
    if (filter.period) query.period = filter.period;
    if (filter.status) query.status = filter.status;
    return this.reconModel.find(query).sort({ createdAt: -1 }).populate('createdBy', 'firstName lastName').populate('reviewedBy', 'firstName lastName').exec();
  }

  async findReconciliationById(id: string): Promise<ReconciliationDocument> {
    const recon = await this.reconModel.findById(id).populate('createdBy', 'firstName lastName').populate('reviewedBy', 'firstName lastName').exec();
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
    return recon.save();
  }

  async getReconciliationStats(branchId: string): Promise<{
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

  // ─── Salary ───────────────────────────────────────────────
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

  async markSalaryPaid(id: string, paymentDate?: string): Promise<SalaryDocument> {
    const salary = await this.findSalaryById(id);
    if (salary.status !== SalaryStatus.APPROVED) {
      throw new BadRequestException('Salary must be approved before marking as paid');
    }
    salary.status = SalaryStatus.PAID;
    salary.paymentDate = paymentDate ? new Date(paymentDate) : new Date();
    return salary.save();
  }

  async getSalaryStats(branchId: string, period?: string): Promise<{
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

  // ─── Cash Entries ─────────────────────────────────────────
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

  async getCashSummary(branchId: string, startDate?: string, endDate?: string): Promise<{
    totalIncome: number;
    totalExpense: number;
    totalTransfer: number;
    totalLoan: number;
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
          totalSalary: { $sum: { $cond: [{ $eq: ['$type', 'salary'] }, '$amount', 0] } },
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

    const s = summary[0] || { totalIncome: 0, totalExpense: 0, totalTransfer: 0, totalLoan: 0, totalSalary: 0 };
    return {
      ...s,
      netCash: s.totalIncome - s.totalExpense - s.totalTransfer - s.totalLoan - s.totalSalary,
      byCategory: byCategory.map((c: any) => ({ category: c._id, total: c.total, count: c.count })),
    };
  }

  // ─── Dashboard ────────────────────────────────────────────
  async getDashboard(branchId: string): Promise<{
    reconciliation: { pending: number; approved: number; rejected: number; totalDiscrepancy: number };
    salary: { totalEmployees: number; totalNet: number; pendingCount: number; paidCount: number };
    cash: { totalIncome: number; totalExpense: number; netCash: number };
    recentReconciliations: ReconciliationDocument[];
    recentCashEntries: CashEntryDocument[];
  }> {
    const defaultRecon = { pending: 0, approved: 0, rejected: 0, totalDiscrepancy: 0 };
    const defaultSalary = { totalEmployees: 0, totalBase: 0, totalAllowances: 0, totalDeductions: 0, totalNet: 0, pendingCount: 0, paidCount: 0 };
    const defaultCash = { totalIncome: 0, totalExpense: 0, totalTransfer: 0, totalLoan: 0, totalSalary: 0, netCash: 0, byCategory: [] as any[] };

    const [reconciliation, salary, cash, recentReconciliations, recentCashEntries] = await Promise.all([
      this.getReconciliationStats(branchId).catch((e) => { this.logger.warn(`Reconciliation stats failed: ${e.message}`); return defaultRecon; }),
      this.getSalaryStats(branchId).catch((e) => { this.logger.warn(`Salary stats failed: ${e.message}`); return defaultSalary; }),
      this.getCashSummary(branchId).catch((e) => { this.logger.warn(`Cash summary failed: ${e.message}`); return defaultCash; }),
      this.reconModel.find({ branchId: new Types.ObjectId(branchId) }).sort({ createdAt: -1 }).limit(5).exec().catch((e) => { this.logger.warn(`Recent reconciliations failed: ${e.message}`); return []; }),
      this.cashModel.find({ branchId: new Types.ObjectId(branchId), isActive: true }).sort({ entryDate: -1 }).limit(10).exec().catch((e) => { this.logger.warn(`Recent cash entries failed: ${e.message}`); return []; }),
    ]);
    return { reconciliation, salary, cash, recentReconciliations, recentCashEntries };
  }

  async receiveFinancePush(dto: any, userId: string): Promise<any> {
    const source = dto.source?.toLowerCase();
    if (!['emr', 'lab'].includes(source)) {
      throw new BadRequestException('Source must be "emr" or "lab"');
    }

    const cashEntry = await this.cashModel.create({
      type: 'income',
      category: 'sales',
      branchId: new Types.ObjectId(dto.source === 'emr' ? 'emr' : 'lab'),
      amount: dto.totalRevenue || 0,
      description: `${source.toUpperCase()} Daily Finance Push - ${dto.date}`,
      notes: JSON.stringify({
        totalExpenses: dto.totalExpenses,
        netIncome: dto.netIncome,
        cashCollected: dto.cashCollected,
        orangeMoneyCollected: dto.orangeMoneyCollected,
        afrimoneyCollected: dto.afrimoneyCollected,
        outstandingBalance: dto.outstandingBalance,
        orderCount: dto.orderCount,
        submittedBy: dto.submittedBy,
        pushNotes: dto.notes,
      }),
      recordedBy: new Types.ObjectId(userId),
      entryDate: new Date(dto.date),
    });

    this.logger.log(`Finance push received from ${source.toUpperCase()} for ${dto.date}: Le ${dto.totalRevenue}`);
    return cashEntry;
  }
}
