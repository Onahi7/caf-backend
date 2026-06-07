import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import {
  EmployeeAdvance, EmployeeAdvanceDocument, AdvanceStatus, AdvanceType, RepaymentType,
} from './schema/employee-advance.schema.js';
import { CashEntry, CashEntryDocument, CashEntryType, CashEntryCategory } from './schema/cash-entry.schema.js';
import { Sale, SaleDocument, SaleType, SaleStatus, PaymentStatus, PaymentMethod } from '../sales/schemas/sale.schema.js';
import { StockMovement, StockMovementDocument, MovementType } from '../inventory/schemas/stock-movement.schema.js';
import {
  CreateEmployeeAdvanceDto, RecordAdvanceRepaymentDto, WriteOffAdvanceDto, AdvanceFilterDto,
} from './dto/employee-advance.dto.js';

@Injectable()
export class EmployeeAdvanceService {
  private readonly logger = new Logger(EmployeeAdvanceService.name);

  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(EmployeeAdvance.name) private readonly advanceModel: Model<EmployeeAdvanceDocument>,
    @InjectModel(CashEntry.name) private readonly cashModel: Model<CashEntryDocument>,
    @InjectModel(Sale.name) private readonly saleModel: Model<SaleDocument>,
    @InjectModel(StockMovement.name) private readonly stockModel: Model<StockMovementDocument>,
  ) {}

  async createAdvance(dto: CreateEmployeeAdvanceDto, userId: string): Promise<EmployeeAdvanceDocument> {
    const existing = await this.advanceModel.findOne({ referenceNumber: dto.referenceNumber }).exec();
    if (existing) {
      throw new BadRequestException(`Advance with reference ${dto.referenceNumber} already exists`);
    }

    if (dto.employeeId === userId && !dto.coSignedBy) {
      throw new BadRequestException(
        'Self-issued advance requires a co-signer (coSignedBy must be a different user)',
      );
    }
    if (dto.coSignedBy && dto.coSignedBy === dto.employeeId) {
      throw new BadRequestException('Co-signer cannot be the same as the employee receiving the advance');
    }

    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      const advanceArr = await this.advanceModel.create([{
        ...dto,
        branchId: new Types.ObjectId(dto.branchId),
        employeeId: new Types.ObjectId(dto.employeeId),
        outstandingAmount: dto.totalAmount,
        coSignedBy: dto.coSignedBy ? new Types.ObjectId(dto.coSignedBy) : undefined,
        createdBy: new Types.ObjectId(userId),
        advanceDate: new Date(dto.advanceDate),
      } as any], { session });

      const advanceDoc = advanceArr[0] as EmployeeAdvanceDocument;

      if (dto.type === AdvanceType.GOODS && dto.items && dto.items.length > 0) {
        const receiptNumber = `STAFF-ADV-${dto.referenceNumber}`;

        const saleItems = dto.items.map((item) => ({
          productId: new Types.ObjectId(item.productId),
          batchId: item.batchId ? new Types.ObjectId(item.batchId) : undefined,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          subtotal: item.quantity * item.unitPrice,
        }));

        const saleArr = await this.saleModel.create([{
          branchId: new Types.ObjectId(dto.branchId),
          shiftId: new Types.ObjectId('000000000000000000000000'),
          terminalId: 'staff-advance',
          cashierId: new Types.ObjectId(userId),
          items: saleItems,
          subtotal: dto.totalAmount,
          total: dto.totalAmount,
          saleType: SaleType.CREDIT,
          paymentMethod: PaymentMethod.CREDIT,
          paymentStatus: PaymentStatus.UNPAID,
          amountPaid: 0,
          balanceDue: dto.totalAmount,
          status: SaleStatus.COMPLETED,
          receiptNumber,
          customerName: `Staff Advance: ${dto.employeeId}`,
          sourceSystem: 'staff-advance',
          notes: `Staff advance ${dto.referenceNumber}`,
        }], { session });

        const saleDoc = saleArr[0] as SaleDocument;
        advanceDoc.sourceSaleId = saleDoc._id;
        await advanceDoc.save({ session });

        for (const item of dto.items) {
          await this.stockModel.create([{
            branchId: new Types.ObjectId(dto.branchId),
            productId: new Types.ObjectId(item.productId),
            batchId: item.batchId ? new Types.ObjectId(item.batchId) : undefined,
            quantity: -item.quantity,
            movementType: MovementType.SALE,
            reason: `Staff advance ${dto.referenceNumber}`,
            userId: new Types.ObjectId(userId),
            referenceId: saleDoc._id,
            referenceType: 'staff-advance',
            timestamp: new Date(dto.advanceDate),
          }], { session });
        }
      } else {
        await this.cashModel.create([{
          type: CashEntryType.ADVANCE,
          category: CashEntryCategory.STAFF_ADVANCE,
          branchId: new Types.ObjectId(dto.branchId),
          amount: dto.totalAmount,
          description: `Cash advance issued: ${dto.referenceNumber}`,
          referenceId: advanceDoc._id.toString(),
          recordedBy: new Types.ObjectId(userId),
          entryDate: new Date(dto.advanceDate),
        }], { session });
      }

      await session.commitTransaction();
      this.logger.log(`Staff advance created: ${dto.referenceNumber} for ${dto.employeeId}`);
      return advanceDoc;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  async findAllAdvances(filter: AdvanceFilterDto): Promise<EmployeeAdvanceDocument[]> {
    const query: Record<string, any> = {};
    if (filter.branchId) query.branchId = new Types.ObjectId(filter.branchId);
    if (filter.employeeId) query.employeeId = new Types.ObjectId(filter.employeeId);
    if (filter.status) query.status = filter.status;
    if (filter.type) query.type = filter.type;
    if (filter.startDate || filter.endDate) {
      query.advanceDate = {};
      if (filter.startDate) query.advanceDate.$gte = new Date(filter.startDate);
      if (filter.endDate) query.advanceDate.$lte = new Date(filter.endDate);
    }
    return this.advanceModel.find(query).sort({ advanceDate: -1 })
      .populate('employeeId', 'firstName lastName username')
      .populate('createdBy', 'firstName lastName')
      .exec();
  }

  async findAdvanceById(id: string): Promise<EmployeeAdvanceDocument> {
    const advance = await this.advanceModel.findById(id)
      .populate('employeeId', 'firstName lastName username')
      .populate('createdBy', 'firstName lastName')
      .exec();
    if (!advance) throw new NotFoundException(`Advance ${id} not found`);
    return advance;
  }

  async recordRepayment(id: string, dto: RecordAdvanceRepaymentDto, userId: string): Promise<EmployeeAdvanceDocument> {
    const advance = await this.findAdvanceById(id);
    if (advance.status === AdvanceStatus.FULLY_SETTLED || advance.status === AdvanceStatus.WRITTEN_OFF) {
      throw new BadRequestException(`Cannot record repayment for advance in ${advance.status} status`);
    }
    if (dto.amount > advance.outstandingAmount + 0.01) {
      throw new BadRequestException(`Repayment ${dto.amount} exceeds outstanding ${advance.outstandingAmount}`);
    }

    const session = await this.connection.startSession();
    session.startTransaction();

    let cashEntryId: Types.ObjectId | undefined;
    try {
      if (dto.type === RepaymentType.CASH_REPAYMENT) {
        const cashEntryArr = await this.cashModel.create([{
          type: CashEntryType.ADVANCE,
          category: CashEntryCategory.STAFF_ADVANCE,
          branchId: advance.branchId,
          amount: dto.amount,
          description: `Cash repayment for staff advance ${advance.referenceNumber}`,
          referenceId: advance._id.toString(),
          recordedBy: new Types.ObjectId(userId),
          entryDate: new Date(dto.repaymentDate),
        }], { session });
        cashEntryId = cashEntryArr[0]._id;
      }

      advance.repayments.push({
        amount: dto.amount,
        type: dto.type,
        salaryId: dto.salaryId ? new Types.ObjectId(dto.salaryId) : undefined,
        cashEntryId,
        repaymentDate: new Date(dto.repaymentDate),
        recordedBy: new Types.ObjectId(userId),
        notes: dto.notes,
      });

      advance.outstandingAmount -= dto.amount;
      if (advance.outstandingAmount <= 0.01) {
        advance.status = AdvanceStatus.FULLY_SETTLED;
        advance.outstandingAmount = 0;
      } else {
        advance.status = AdvanceStatus.PARTIALLY_SETTLED;
      }

      await advance.save({ session });
      await session.commitTransaction();
      this.logger.log(`Advance repayment: ${dto.amount} for ${advance.referenceNumber}, remaining: ${advance.outstandingAmount}`);
      return advance;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  async recordSalaryDeduction(employeeId: string, branchId: string, _period: string, _userId: string): Promise<{
    totalDeducted: number;
    advancesUpdated: number;
    details: { advanceId: string; referenceNumber: string; amountDeducted: number }[];
  }> {
    const openAdvances = await this.advanceModel.find({
      employeeId: new Types.ObjectId(employeeId),
      branchId: new Types.ObjectId(branchId),
      status: { $in: [AdvanceStatus.OUTSTANDING, AdvanceStatus.PARTIALLY_SETTLED] },
    }).sort({ advanceDate: 1 }).exec();

    const details: { advanceId: string; referenceNumber: string; amountDeducted: number }[] = [];
    let totalDeducted = 0;
    let advancesUpdated = 0;

    for (const advance of openAdvances) {
      details.push({
        advanceId: advance._id.toString(),
        referenceNumber: advance.referenceNumber,
        amountDeducted: advance.outstandingAmount,
      });
      totalDeducted += advance.outstandingAmount;
      advancesUpdated += 1;
    }

    return { totalDeducted, advancesUpdated, details };
  }

  async applySalaryDeduction(
    employeeId: string,
    _branchId: string,
    plan: {
      totalDeducted: number;
      advancesUpdated: number;
      details: { advanceId: string; referenceNumber: string; amountDeducted: number }[];
    },
    salaryId: string,
    userId: string,
    session?: ClientSession,
  ): Promise<{ applied: number; settledAdvances: string[] }> {
    if (plan.totalDeducted <= 0 || plan.details.length === 0) {
      return { applied: 0, settledAdvances: [] };
    }

    const settledAdvances: string[] = [];
    const ownSession = !session;
    const activeSession = session ?? (await this.connection.startSession());

    try {
      if (ownSession) activeSession.startTransaction();

      for (const entry of plan.details) {
        const advance = await this.advanceModel
          .findById(new Types.ObjectId(entry.advanceId))
          .session(activeSession);
        if (!advance) continue;
        if (advance.status === AdvanceStatus.FULLY_SETTLED || advance.status === AdvanceStatus.WRITTEN_OFF) {
          continue;
        }

        advance.repayments.push({
          amount: entry.amountDeducted,
          type: RepaymentType.SALARY_DEDUCTION,
          salaryId: new Types.ObjectId(salaryId),
          repaymentDate: new Date(),
          recordedBy: new Types.ObjectId(userId),
          notes: `Auto-deducted via salary ${salaryId} for employee ${employeeId}`,
        });

        advance.outstandingAmount = Math.max(0, advance.outstandingAmount - entry.amountDeducted);
        if (advance.outstandingAmount <= 0.01) {
          advance.status = AdvanceStatus.FULLY_SETTLED;
          advance.outstandingAmount = 0;
          settledAdvances.push(advance._id.toString());
        } else {
          advance.status = AdvanceStatus.PARTIALLY_SETTLED;
        }

        await advance.save({ session: activeSession });
      }

      if (ownSession) await activeSession.commitTransaction();
      this.logger.log(
        `Applied salary deduction of ${plan.totalDeducted} across ${plan.details.length} advance(s) for employee ${employeeId} by user ${userId}`,
      );
      return { applied: plan.totalDeducted, settledAdvances };
    } catch (error) {
      if (ownSession) await activeSession.abortTransaction();
      throw error;
    } finally {
      if (ownSession) activeSession.endSession();
    }
  }

  async writeOffAdvance(id: string, dto: WriteOffAdvanceDto, userId: string): Promise<EmployeeAdvanceDocument> {
    const advance = await this.findAdvanceById(id);
    if (advance.status === AdvanceStatus.FULLY_SETTLED) {
      throw new BadRequestException(`Cannot write off fully settled advance`);
    }

    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      if (advance.outstandingAmount > 0) {
        await this.cashModel.create([{
          type: CashEntryType.EXPENSE,
          category: CashEntryCategory.OTHER,
          branchId: advance.branchId,
          amount: advance.outstandingAmount,
          description: `Bad debt write-off: staff advance ${advance.referenceNumber} - ${dto.reason}`,
          referenceId: advance._id.toString(),
          recordedBy: new Types.ObjectId(userId),
          entryDate: new Date(),
        }], { session });
      }

      advance.status = AdvanceStatus.WRITTEN_OFF;
      advance.outstandingAmount = 0;
      advance.notes = `${advance.notes || ''}\n[Write-off: ${dto.reason}]`;
      await advance.save({ session });

      await session.commitTransaction();
      this.logger.log(`Advance written off: ${advance.referenceNumber} - ${dto.reason}`);
      return advance;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  async returnAdvanceGoods(
    id: string,
    items: { productId: string; batchId?: string; quantity: number }[],
    notes: string | undefined,
    userId: string,
  ): Promise<{
    advance: EmployeeAdvanceDocument;
    returnedAmount: number;
    newStatus: AdvanceStatus;
    stockMovementsCreated: number;
  }> {
    const advance = await this.findAdvanceById(id);
    if (advance.type !== AdvanceType.GOODS) {
      throw new BadRequestException('Goods return is only valid for GOODS-type advances');
    }
    if (!advance.sourceSaleId) {
      throw new BadRequestException('Cannot return goods: this advance has no source sale');
    }
    if (advance.status === AdvanceStatus.FULLY_SETTLED || advance.status === AdvanceStatus.WRITTEN_OFF) {
      throw new BadRequestException(`Cannot return goods for advance in ${advance.status} status`);
    }
    if (!items || items.length === 0) {
      throw new BadRequestException('At least one item must be returned');
    }

    const session = await this.connection.startSession();
    session.startTransaction();

    let returnedAmount = 0;
    let stockMovementsCreated = 0;

    try {
      for (const ret of items) {
        const advanceItem = advance.items.find(
          (i) => i.productId.toString() === ret.productId &&
            (!ret.batchId || i.batchId?.toString() === ret.batchId),
        );
        if (!advanceItem) {
          throw new BadRequestException(
            `Product ${ret.productId} is not part of this advance`,
          );
        }
        if (ret.quantity > advanceItem.quantity) {
          throw new BadRequestException(
            `Cannot return ${ret.quantity} of ${ret.productId}: only ${advanceItem.quantity} issued`,
          );
        }
        const itemSubtotal = ret.quantity * advanceItem.unitPrice;
        returnedAmount += itemSubtotal;

        await this.stockModel.create([{
          branchId: advance.branchId,
          productId: new Types.ObjectId(ret.productId),
          batchId: ret.batchId ? new Types.ObjectId(ret.batchId) : advanceItem.batchId,
          quantity: ret.quantity,
          movementType: MovementType.RETURN,
          reason: `Staff advance goods return: ${advance.referenceNumber}`,
          userId: new Types.ObjectId(userId),
          referenceId: advance._id,
          referenceType: 'staff-advance-return',
          timestamp: new Date(),
        }], { session });
        stockMovementsCreated += 1;
      }

      if (returnedAmount > 0) {
        advance.repayments.push({
          amount: returnedAmount,
          type: RepaymentType.GOODS_RETURN,
          returnSaleId: advance.sourceSaleId,
          repaymentDate: new Date(),
          recordedBy: new Types.ObjectId(userId),
          notes: notes || `Goods return: ${items.length} item(s)`,
        });

        advance.outstandingAmount = Math.max(0, advance.outstandingAmount - returnedAmount);
        if (advance.outstandingAmount <= 0.01) {
          advance.status = AdvanceStatus.FULLY_SETTLED;
          advance.outstandingAmount = 0;
        } else {
          advance.status = AdvanceStatus.PARTIALLY_SETTLED;
        }
      }

      await advance.save({ session });
      await session.commitTransaction();

      this.logger.log(
        `Goods returned for advance ${advance.referenceNumber}: ${items.length} item(s), amount ${returnedAmount}`,
      );
      return {
        advance,
        returnedAmount,
        newStatus: advance.status,
        stockMovementsCreated,
      };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  async getOutstandingByEmployee(employeeId: string, branchId?: string): Promise<{
    total: number;
    advances: EmployeeAdvanceDocument[];
  }> {
    const query: Record<string, any> = {
      employeeId: new Types.ObjectId(employeeId),
      status: { $in: [AdvanceStatus.OUTSTANDING, AdvanceStatus.PARTIALLY_SETTLED] },
    };
    if (branchId) query.branchId = new Types.ObjectId(branchId);
    const advances = await this.advanceModel.find(query).sort({ advanceDate: 1 }).exec();
    const total = advances.reduce((sum, a) => sum + a.outstandingAmount, 0);
    return { total, advances };
  }

  async getFinalSettlement(employeeId: string, branchId?: string): Promise<{
    employeeId: string;
    branchId?: string;
    canOffboard: boolean;
    outstandingAdvanceTotal: number;
    openAdvanceCount: number;
    openAdvances: {
      id: string;
      referenceNumber: string;
      type: AdvanceType;
      totalAmount: number;
      outstandingAmount: number;
      advanceDate: Date;
    }[];
    blockReason?: string;
  }> {
    const query: Record<string, any> = {
      employeeId: new Types.ObjectId(employeeId),
      status: { $in: [AdvanceStatus.OUTSTANDING, AdvanceStatus.PARTIALLY_SETTLED] },
    };
    if (branchId) query.branchId = new Types.ObjectId(branchId);
    const openAdvances = await this.advanceModel.find(query).sort({ advanceDate: 1 }).exec();
    const total = openAdvances.reduce((sum, a) => sum + a.outstandingAmount, 0);

    return {
      employeeId,
      branchId,
      canOffboard: openAdvances.length === 0,
      outstandingAdvanceTotal: total,
      openAdvanceCount: openAdvances.length,
      openAdvances: openAdvances.map((a) => ({
        id: a._id.toString(),
        referenceNumber: a.referenceNumber,
        type: a.type,
        totalAmount: a.totalAmount,
        outstandingAmount: a.outstandingAmount,
        advanceDate: a.advanceDate,
      })),
      blockReason:
        openAdvances.length > 0
          ? `Employee has ${openAdvances.length} outstanding advance(s) totalling ${total}. All must be settled, returned, or written off before off-boarding.`
          : undefined,
    };
  }

  async getAdvanceStats(branchId?: string): Promise<{
    totalActive: number;
    totalOutstanding: number;
    totalCashAdvances: number;
    totalGoodsAdvances: number;
    totalCostToCompany: number;
    byStatus: { status: string; count: number; outstanding: number }[];
  }> {
    const query: Record<string, any> = {};
    if (branchId) query.branchId = new Types.ObjectId(branchId);

    const result = await this.advanceModel.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalActive: { $sum: { $cond: [{ $in: ['$status', ['outstanding', 'partially_settled']] }, 1, 0] } },
          totalOutstanding: { $sum: { $cond: [{ $in: ['$status', ['outstanding', 'partially_settled']] }, '$outstandingAmount', 0] } },
          totalCashAdvances: { $sum: { $cond: [{ $and: [{ $eq: ['$type', 'cash'] }, { $in: ['$status', ['outstanding', 'partially_settled']] }] }, '$outstandingAmount', 0] } },
          totalGoodsAdvances: { $sum: { $cond: [{ $and: [{ $eq: ['$type', 'goods'] }, { $in: ['$status', ['outstanding', 'partially_settled']] }] }, '$outstandingAmount', 0] } },
          totalCostToCompany: { $sum: '$totalCost' },
        },
      },
    ]).exec();

    const byStatus = await this.advanceModel.aggregate([
      { $match: query },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          outstanding: { $sum: '$outstandingAmount' },
        },
      },
    ]).exec();

    const s = result[0] || {
      totalActive: 0, totalOutstanding: 0, totalCashAdvances: 0, totalGoodsAdvances: 0, totalCostToCompany: 0,
    };
    return {
      ...s,
      byStatus: byStatus.map((b: any) => ({ status: b._id, count: b.count, outstanding: b.outstanding })),
    };
  }
}
