import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { Loan, LoanDocument, LoanStatus } from './schema/loan.schema.js';
import { CashEntry, CashEntryDocument, CashEntryType, CashEntryCategory } from './schema/cash-entry.schema.js';
import { CreateLoanDto, RecordLoanRepaymentDto, LoanFilterDto } from './dto/loan.dto.js';

@Injectable()
export class LoanService {
  private readonly logger = new Logger(LoanService.name);

  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Loan.name) private readonly loanModel: Model<LoanDocument>,
    @InjectModel(CashEntry.name) private readonly cashModel: Model<CashEntryDocument>,
  ) {}

  async createLoan(dto: CreateLoanDto, userId: string): Promise<LoanDocument> {
    const existing = await this.loanModel.findOne({ referenceNumber: dto.referenceNumber }).exec();
    if (existing) {
      throw new BadRequestException(`Loan with reference ${dto.referenceNumber} already exists`);
    }

    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      const loanArr = await this.loanModel.create([{
        ...dto,
        branchId: new Types.ObjectId(dto.branchId),
        startDate: new Date(dto.startDate),
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        outstandingPrincipal: dto.principalAmount,
        createdBy: new Types.ObjectId(userId),
        approvedBy: dto.approvedBy ? new Types.ObjectId(dto.approvedBy) : undefined,
        approvedAt: dto.approvedBy ? new Date() : undefined,
      }], { session });
      const loan = loanArr[0];

      await this.cashModel.create([{
        type: CashEntryType.LOAN,
        category: CashEntryCategory.OTHER,
        branchId: new Types.ObjectId(dto.branchId),
        amount: dto.principalAmount,
        description: `Loan ${dto.referenceNumber} - ${dto.direction} from ${dto.counterpartyName}`,
        referenceId: loan._id.toString(),
        recordedBy: new Types.ObjectId(userId),
        entryDate: new Date(dto.startDate),
      }], { session });

      await session.commitTransaction();
      this.logger.log(`Loan created: ${dto.referenceNumber} ${dto.direction} ${dto.principalAmount}`);
      return loan;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  async findAllLoans(filter: LoanFilterDto): Promise<LoanDocument[]> {
    const query: Record<string, any> = {};
    if (filter.branchId) query.branchId = new Types.ObjectId(filter.branchId);
    if (filter.direction) query.direction = filter.direction;
    if (filter.status) query.status = filter.status;
    if (filter.counterpartyName) query.counterpartyName = new RegExp(filter.counterpartyName, 'i');
    if (filter.startDate || filter.endDate) {
      query.startDate = {};
      if (filter.startDate) query.startDate.$gte = new Date(filter.startDate);
      if (filter.endDate) query.startDate.$lte = new Date(filter.endDate);
    }
    return this.loanModel.find(query).sort({ startDate: -1 }).populate('createdBy', 'firstName lastName').populate('approvedBy', 'firstName lastName').exec();
  }

  async findLoanById(id: string): Promise<LoanDocument> {
    const loan = await this.loanModel.findById(id).populate('createdBy', 'firstName lastName').populate('approvedBy', 'firstName lastName').exec();
    if (!loan) throw new NotFoundException(`Loan ${id} not found`);
    return loan;
  }

  async recordRepayment(id: string, dto: RecordLoanRepaymentDto, userId: string): Promise<LoanDocument> {
    const loan = await this.findLoanById(id);
    if (loan.status !== LoanStatus.ACTIVE) {
      throw new BadRequestException(`Cannot record repayment for loan in ${loan.status} status`);
    }

    const totalOwed = loan.outstandingPrincipal;
    if (dto.amount > totalOwed + 0.01) {
      throw new BadRequestException(`Repayment ${dto.amount} exceeds outstanding ${totalOwed}`);
    }

    const interestShare = loan.totalInterestAccrued > 0
      ? (dto.amount * loan.totalInterestAccrued) / (loan.totalInterestAccrued + loan.outstandingPrincipal)
      : 0;
    const interestAmount = Math.min(interestShare, loan.totalInterestAccrued);
    const principalAmount = dto.amount - interestAmount;

    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      const cashEntryArr = await this.cashModel.create([{
        type: CashEntryType.LOAN,
        category: CashEntryCategory.OTHER,
        branchId: loan.branchId,
        amount: dto.amount,
        description: `Loan repayment for ${loan.referenceNumber}`,
        referenceId: loan._id.toString(),
        recordedBy: new Types.ObjectId(userId),
        entryDate: new Date(dto.paymentDate),
      }], { session });
      const cashEntry = cashEntryArr[0];

      loan.repayments.push({
        amount: dto.amount,
        principalAmount,
        interestAmount,
        paymentDate: new Date(dto.paymentDate),
        notes: dto.notes,
        recordedBy: new Types.ObjectId(userId),
        cashEntryId: cashEntry._id,
      });
      loan.outstandingPrincipal -= principalAmount;
      loan.totalPrincipalPaid += principalAmount;
      loan.totalInterestPaid += interestAmount;
      loan.totalInterestAccrued = Math.max(0, loan.totalInterestAccrued - interestAmount);

      if (loan.outstandingPrincipal <= 0.01) {
        loan.status = LoanStatus.FULLY_REPAID;
        loan.outstandingPrincipal = 0;
        loan.closedAt = new Date();
      }

      await loan.save({ session });
      await session.commitTransaction();
      this.logger.log(`Loan repayment: ${dto.amount} for ${loan.referenceNumber}, remaining: ${loan.outstandingPrincipal}`);
      return loan;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  async accrueInterest(id: string, months: number, userId: string): Promise<LoanDocument> {
    const loan = await this.findLoanById(id);
    if (loan.status !== LoanStatus.ACTIVE) {
      throw new BadRequestException(`Cannot accrue interest for loan in ${loan.status} status`);
    }

    const monthlyRate = loan.interestRatePercent / 100 / 12;
    const interestAccrued = loan.outstandingPrincipal * monthlyRate * months;

    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      loan.totalInterestAccrued += interestAccrued;

      await this.cashModel.create([{
        type: CashEntryType.LOAN,
        category: CashEntryCategory.OTHER,
        branchId: loan.branchId,
        amount: interestAccrued,
        description: `Loan interest accrued: ${loan.referenceNumber} (${months} months)`,
        referenceId: loan._id.toString(),
        recordedBy: new Types.ObjectId(userId),
        entryDate: new Date(),
      }], { session });

      await loan.save({ session });
      await session.commitTransaction();
      this.logger.log(`Loan interest accrued: ${interestAccrued} for ${loan.referenceNumber}`);
      return loan;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  async closeLoan(id: string, userId: string): Promise<LoanDocument> {
    const loan = await this.findLoanById(id);
    if (loan.outstandingPrincipal > 0.01) {
      throw new BadRequestException(`Cannot close loan with outstanding principal ${loan.outstandingPrincipal}`);
    }
    loan.status = LoanStatus.FULLY_REPAID;
    loan.closedAt = new Date();
    this.logger.log(`Loan ${loan.referenceNumber} closed by ${userId}`);
    return loan.save();
  }

  async cancelLoan(id: string, reason: string, userId: string): Promise<LoanDocument> {
    const loan = await this.findLoanById(id);
    if (loan.totalPrincipalPaid > 0) {
      throw new BadRequestException(`Cannot cancel loan with repayments already made`);
    }
    loan.status = LoanStatus.CANCELLED;
    loan.closedAt = new Date();
    this.logger.log(`Loan ${loan.referenceNumber} cancelled: ${reason} (by ${userId})`);
    return loan.save();
  }

  async getLoanStats(branchId?: string): Promise<{
    totalActive: number;
    totalReceived: number;
    totalGiven: number;
    totalOutstanding: number;
    totalAccruedInterest: number;
    byStatus: { status: string; count: number; outstanding: number }[];
  }> {
    const query: Record<string, any> = {};
    if (branchId) query.branchId = new Types.ObjectId(branchId);

    const result = await this.loanModel.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalActive: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } },
          totalReceived: { $sum: { $cond: [{ $and: [{ $eq: ['$status', 'active'] }, { $eq: ['$direction', 'received'] }] }, '$principalAmount', 0] } },
          totalGiven: { $sum: { $cond: [{ $and: [{ $eq: ['$status', 'active'] }, { $eq: ['$direction', 'given'] }] }, '$principalAmount', 0] } },
          totalOutstanding: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, '$outstandingPrincipal', 0] } },
          totalAccruedInterest: { $sum: '$totalInterestAccrued' },
        },
      },
    ]).exec();

    const byStatus = await this.loanModel.aggregate([
      { $match: query },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          outstanding: { $sum: '$outstandingPrincipal' },
        },
      },
    ]).exec();

    const s = result[0] || { totalActive: 0, totalReceived: 0, totalGiven: 0, totalOutstanding: 0, totalAccruedInterest: 0 };
    return {
      ...s,
      byStatus: byStatus.map((b: any) => ({ status: b._id, count: b.count, outstanding: b.outstanding })),
    };
  }
}
