import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, ClientSession } from 'mongoose';
import {
  Sale,
  SaleDocument,
  SaleItem,
  SalePaymentEntry,
  PaymentStatus,
  SaleType,
  SaleStatus,
  PrescriptionStatus,
} from './schemas/sale.schema.js';
import { SaleFilterDto } from './dto/sale-filter.dto.js';

/**
 * Repository for sale operations
 * Requirements: 6.3, 6.4, 6.5
 * Properties: 23, 24, 25, 30
 */
@Injectable()
export class SalesRepository {
  constructor(
    @InjectModel(Sale.name) private saleModel: Model<SaleDocument>,
    @InjectModel('Counter') private counterModel: Model<any>,
  ) {}

  /**
   * Generate a unique receipt number using atomic counter
   * Format: RCP-YYYYMMDD-{XXXXX} (where XXXXX is a sequential number padded to 5 digits)
   * Uses MongoDB's atomic $inc to prevent race conditions
   */
  async generateReceiptNumber(_branchId: string): Promise<string> {
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
    const prefix = `RCP-${dateStr}`;

    // Use atomic findOneAndUpdate with $inc to prevent race conditions
    const result = await this.counterModel.findOneAndUpdate(
      { _id: prefix },
      { $inc: { sequence: 1 } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const sequence = result.sequence;
    return `${prefix}-${sequence.toString().padStart(5, '0')}`;
  }

  /**
   * Create a new sale
   * Property 24: Receipt completeness
   * Property 30: Sales-shift association
   */
  async create(
    saleData: {
      branchId: string;
      shiftId: string;
      terminalId: string;
      cashierId: string;
      items: SaleItem[];
      subtotal: number;
      discount: number;
      total: number;
      paymentMethod: string;
      saleType: SaleType;
      paymentStatus: PaymentStatus;
      amountPaid: number;
      balanceDue: number;
      dueDate?: Date;
      payments: SalePaymentEntry[];
      paymentReference?: string;
      prescriptionUrl?: string;
      prescriptionStatus?: PrescriptionStatus;
      customerName?: string;
      customerPhone?: string;
      customerId?: Types.ObjectId;
      patientId?: string;
      patientName?: string;
      sourceSystem?: string;
      notes?: string;
      receiptNumber: string;
    },
    session?: ClientSession,
  ): Promise<SaleDocument> {
    const sale = new this.saleModel({
      branchId: new Types.ObjectId(saleData.branchId),
      shiftId: new Types.ObjectId(saleData.shiftId),
      terminalId: saleData.terminalId,
      cashierId: new Types.ObjectId(saleData.cashierId),
      items: saleData.items,
      subtotal: saleData.subtotal,
      discount: saleData.discount,
      total: saleData.total,
      saleType: saleData.saleType,
      paymentMethod: saleData.paymentMethod,
      paymentReference: saleData.paymentReference,
      paymentStatus: saleData.paymentStatus,
      amountPaid: saleData.amountPaid,
      balanceDue: saleData.balanceDue,
      dueDate: saleData.dueDate,
      payments: saleData.payments,
      prescriptionUrl: saleData.prescriptionUrl,
      prescriptionStatus: saleData.prescriptionStatus,
      customerName: saleData.customerName,
      customerPhone: saleData.customerPhone,
      customerId: saleData.customerId,
      patientId: saleData.patientId,
      patientName: saleData.patientName,
      sourceSystem: saleData.sourceSystem,
      notes: saleData.notes,
      receiptNumber: saleData.receiptNumber,
      status: SaleStatus.COMPLETED,
      returnedAmount: 0,
    });

    if (session) {
      return sale.save({ session });
    }
    return sale.save();
  }

  /**
   * Find sale by ID
   */
  async findById(id: string): Promise<SaleDocument | null> {
    return this.saleModel.findById(id).exec();
  }

  /**
   * Find sale by receipt number
   */
  async findByReceiptNumber(
    receiptNumber: string,
  ): Promise<SaleDocument | null> {
    return this.saleModel.findOne({ receiptNumber }).exec();
  }

  /**
   * Find sales with filtering
   */
  async findWithFilter(filter: SaleFilterDto): Promise<SaleDocument[]> {
    const query: Record<string, unknown> = {};

    if (filter.branchId) {
      query.branchId = new Types.ObjectId(filter.branchId);
    }
    if (filter.shiftId) {
      query.shiftId = new Types.ObjectId(filter.shiftId);
    }
    if (filter.cashierId) {
      query.cashierId = new Types.ObjectId(filter.cashierId);
    }
    if (filter.status) {
      query.status = filter.status;
    }
    if (filter.receiptNumber) {
      query.receiptNumber = { $regex: filter.receiptNumber, $options: 'i' };
    }
    if (filter.search) {
      query.$or = [
        { receiptNumber: { $regex: filter.search, $options: 'i' } },
        { customerName: { $regex: filter.search, $options: 'i' } },
        { customerPhone: { $regex: filter.search, $options: 'i' } },
      ];
    }
    if (filter.productId) {
      query['items.productId'] = new Types.ObjectId(filter.productId);
    }
    if (filter.paymentMethod) {
      query.paymentMethod = filter.paymentMethod;
    }
    if (filter.saleType) {
      query.saleType = filter.saleType;
    }
    if (filter.paymentStatus) {
      query.paymentStatus = filter.paymentStatus;
    }

    // Date range filtering
    if (filter.startDate || filter.endDate) {
      query.createdAt = {};
      if (filter.startDate) {
        (query.createdAt as Record<string, unknown>).$gte = filter.startDate;
      }
      if (filter.endDate) {
        (query.createdAt as Record<string, unknown>).$lte = filter.endDate;
      }
    }

    let queryBuilder = this.saleModel.find(query).sort({ createdAt: -1 });

    if (filter.skip) {
      queryBuilder = queryBuilder.skip(filter.skip);
    }
    if (filter.limit) {
      queryBuilder = queryBuilder.limit(filter.limit);
    }

    return queryBuilder.exec();
  }

  /**
   * Find sales by shift
   * Property 30: Sales-shift association
   */
  async findByShift(shiftId: string): Promise<SaleDocument[]> {
    return this.saleModel
      .find({ shiftId: new Types.ObjectId(shiftId) })
      .sort({ createdAt: -1 })
      .exec();
  }

  /**
   * Find sales by branch
   */
  async findByBranch(branchId: string): Promise<SaleDocument[]> {
    return this.saleModel
      .find({ branchId: new Types.ObjectId(branchId) })
      .sort({ createdAt: -1 })
      .exec();
  }

  /**
   * Calculate total sales for a shift
   * Used for shift closing calculations
   */
  async calculateShiftTotal(shiftId: string): Promise<number> {
    const result = await this.saleModel.aggregate([
      { $match: { shiftId: new Types.ObjectId(shiftId) } },
      {
        $group: {
          _id: null,
          totalSales: { $sum: '$total' },
          totalReturns: { $sum: '$returnedAmount' },
        },
      },
    ]);

    if (result.length === 0) {
      return 0;
    }

    return result[0].totalSales - result[0].totalReturns;
  }

  /**
   * Update sale status
   * Property 48: Sale record update on return
   */
  async updateStatus(
    id: string,
    status: SaleStatus,
    returnedAmount?: number,
    session?: ClientSession,
  ): Promise<SaleDocument | null> {
    const updateData: Partial<SaleDocument> = { status };
    if (returnedAmount !== undefined) {
      updateData.returnedAmount = returnedAmount;
    }

    if (session) {
      return this.saleModel
        .findByIdAndUpdate(id, updateData, { new: true, session })
        .exec();
    }
    return this.saleModel
      .findByIdAndUpdate(id, updateData, { new: true })
      .exec();
  }

  /**
   * Update item returned quantity
   * Property 47: Partial return support
   */
  async updateItemReturnedQuantity(
    saleId: string,
    productId: string,
    returnedQuantity: number,
    session?: ClientSession,
  ): Promise<SaleDocument | null> {
    const options = session ? { new: true, session } : { new: true };

    return this.saleModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(saleId),
          'items.productId': new Types.ObjectId(productId),
        },
        {
          $inc: { 'items.$.returnedQuantity': returnedQuantity },
        },
        options,
      )
      .exec();
  }

  /**
   * Update prescription verification status
   * Property 81: Prescription verification status
   */
  async updatePrescriptionStatus(
    id: string,
    status: PrescriptionStatus,
    verifiedBy: string,
  ): Promise<SaleDocument | null> {
    return this.saleModel
      .findByIdAndUpdate(
        id,
        {
          prescriptionStatus: status,
          prescriptionVerifiedBy: new Types.ObjectId(verifiedBy),
          prescriptionVerifiedAt: new Date(),
        },
        { new: true },
      )
      .exec();
  }

  async recordPayment(
    id: string,
    payment: SalePaymentEntry,
    nextAmountPaid: number,
    nextBalanceDue: number,
    paymentStatus: PaymentStatus,
    session?: ClientSession,
  ): Promise<SaleDocument | null> {
    const options = session ? { new: true, session } : { new: true };

    return this.saleModel
      .findByIdAndUpdate(
        id,
        {
          $push: { payments: payment },
          $set: {
            amountPaid: nextAmountPaid,
            balanceDue: nextBalanceDue,
            paymentStatus,
          },
        },
        options,
      )
      .exec();
  }

  async markOverdueCreditSales(branchId?: string): Promise<number> {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const query: Record<string, unknown> = {
      saleType: SaleType.CREDIT,
      paymentStatus: { $in: [PaymentStatus.UNPAID, PaymentStatus.PARTIAL] },
      balanceDue: { $gt: 0 },
      dueDate: { $lt: startOfToday },
    };

    if (branchId) {
      query.branchId = new Types.ObjectId(branchId);
    }

    const result = await this.saleModel
      .updateMany(query, { $set: { paymentStatus: PaymentStatus.OVERDUE } })
      .exec();

    return result.modifiedCount ?? 0;
  }

  /**
   * Count sales for a shift
   */
  async countByShift(shiftId: string): Promise<number> {
    return this.saleModel
      .countDocuments({ shiftId: new Types.ObjectId(shiftId) })
      .exec();
  }

  /**
   * Get sales statistics for a branch within a date range
   */
  async getSalesStats(
    branchId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<{
    totalSales: number;
    totalAmount: number;
    totalReturns: number;
    averageTransaction: number;
  }> {
    const result = await this.saleModel.aggregate([
      {
        $match: {
          branchId: new Types.ObjectId(branchId),
          createdAt: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: null,
          totalSales: { $sum: 1 },
          totalAmount: { $sum: '$total' },
          totalReturns: { $sum: '$returnedAmount' },
        },
      },
    ]);

    if (result.length === 0) {
      return {
        totalSales: 0,
        totalAmount: 0,
        totalReturns: 0,
        averageTransaction: 0,
      };
    }

    const stats = result[0];
    return {
      totalSales: stats.totalSales,
      totalAmount: stats.totalAmount,
      totalReturns: stats.totalReturns,
      averageTransaction:
        stats.totalSales > 0 ? stats.totalAmount / stats.totalSales : 0,
    };
  }
}
