import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import {
  PurchaseOrder,
  PurchaseOrderDocument,
  PurchaseOrderStatus,
} from './schemas/purchase-order.schema.js';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto.js';
import { PurchaseOrderFilterDto } from './dto/purchase-order-filter.dto.js';

@Injectable()
export class PurchasesRepository {
  private orderCounter = 0;

  constructor(
    @InjectModel(PurchaseOrder.name)
    private purchaseOrderModel: Model<PurchaseOrderDocument>,
  ) {}

  /**
   * Generate a unique order number
   * Format: PO-YYYYMMDD-{XXXX} (where XXXX is a sequential number padded to 4 digits)
   */
  private generateOrderNumber(): string {
    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
    this.orderCounter++;
    const counter = this.orderCounter.toString().padStart(4, '0');
    return `PO-${dateStr}-${counter}`;
  }

  async create(
    createPurchaseOrderDto: CreatePurchaseOrderDto,
  ): Promise<PurchaseOrderDocument> {
    // Calculate total amount
    const totalAmount = createPurchaseOrderDto.items.reduce(
      (sum, item) => sum + item.quantity * item.unitPrice,
      0,
    );

    const purchaseOrder = new this.purchaseOrderModel({
      ...createPurchaseOrderDto,
      supplierId: new Types.ObjectId(createPurchaseOrderDto.supplierId),
      branchId: new Types.ObjectId(createPurchaseOrderDto.branchId),
      createdBy: new Types.ObjectId(createPurchaseOrderDto.createdBy),
      orderNumber: this.generateOrderNumber(),
      totalAmount,
      status: PurchaseOrderStatus.PENDING,
      items: createPurchaseOrderDto.items.map((item) => ({
        ...item,
        productId: new Types.ObjectId(item.productId),
        receivedQuantity: 0,
      })),
    });

    return purchaseOrder.save();
  }

  async findAll(): Promise<PurchaseOrderDocument[]> {
    return this.purchaseOrderModel
      .find()
      .populate('supplierId')
      .populate('branchId')
      .sort({ createdAt: -1 })
      .exec();
  }

  async findById(
    id: string,
    session?: ClientSession,
  ): Promise<PurchaseOrderDocument | null> {
    const query = this.purchaseOrderModel
      .findById(id)
      .populate('supplierId')
      .populate('branchId');

    if (session) {
      query.session(session);
    }

    return query.exec();
  }

  async findByOrderNumber(
    orderNumber: string,
  ): Promise<PurchaseOrderDocument | null> {
    return this.purchaseOrderModel
      .findOne({ orderNumber })
      .populate('supplierId')
      .populate('branchId')
      .exec();
  }

  async findByFilter(
    filter: PurchaseOrderFilterDto,
  ): Promise<PurchaseOrderDocument[]> {
    const query: any = {};

    if (filter.supplierId) {
      query.supplierId = {
        $in: [filter.supplierId, new Types.ObjectId(filter.supplierId)],
      };
    }

    if (filter.branchId) {
      query.branchId = {
        $in: [filter.branchId, new Types.ObjectId(filter.branchId)],
      };
    }

    if (filter.status) {
      query.status = filter.status;
    }

    if (filter.startDate || filter.endDate) {
      query.createdAt = {};
      if (filter.startDate) {
        query.createdAt.$gte = filter.startDate;
      }
      if (filter.endDate) {
        query.createdAt.$lte = filter.endDate;
      }
    }

    return this.purchaseOrderModel
      .find(query)
      .populate('supplierId')
      .populate('branchId')
      .sort({ createdAt: -1 })
      .exec();
  }

  async findByBranch(branchId: string): Promise<PurchaseOrderDocument[]> {
    return this.purchaseOrderModel
      .find({ branchId: { $in: [branchId, new Types.ObjectId(branchId)] } })
      .populate('supplierId')
      .sort({ createdAt: -1 })
      .exec();
  }

  async findBySupplier(supplierId: string): Promise<PurchaseOrderDocument[]> {
    return this.purchaseOrderModel
      .find({ supplierId: { $in: [supplierId, new Types.ObjectId(supplierId)] } })
      .populate('branchId')
      .sort({ createdAt: -1 })
      .exec();
  }

  async findByStatus(
    status: PurchaseOrderStatus,
  ): Promise<PurchaseOrderDocument[]> {
    return this.purchaseOrderModel
      .find({ status })
      .populate('supplierId')
      .populate('branchId')
      .sort({ createdAt: -1 })
      .exec();
  }

  async findPending(): Promise<PurchaseOrderDocument[]> {
    return this.findByStatus(PurchaseOrderStatus.PENDING);
  }

  async updateStatus(
    id: string,
    status: PurchaseOrderStatus,
    session?: ClientSession,
  ): Promise<PurchaseOrderDocument | null> {
    const updateData: any = { status };

    if (status === PurchaseOrderStatus.COMPLETED) {
      updateData.receivedAt = new Date();
    }

    const options: { new: boolean; session?: ClientSession } = { new: true };
    if (session) {
      options.session = session;
    }

    return this.purchaseOrderModel
      .findByIdAndUpdate(id, updateData, options)
      .exec();
  }

  async updateItemReceivedQuantity(
    id: string,
    productId: string,
    receivedQuantity: number,
    session?: ClientSession,
  ): Promise<PurchaseOrderDocument | null> {
    const options: { new: boolean; session?: ClientSession } = { new: true };
    if (session) {
      options.session = session;
    }

    return this.purchaseOrderModel
      .findOneAndUpdate(
        { _id: id, 'items.productId': new Types.ObjectId(productId) },
        { $set: { 'items.$.receivedQuantity': receivedQuantity } },
        options,
      )
      .exec();
  }

  async cancel(id: string): Promise<PurchaseOrderDocument | null> {
    return this.purchaseOrderModel
      .findByIdAndUpdate(
        id,
        { status: PurchaseOrderStatus.CANCELLED },
        { new: true },
      )
      .exec();
  }

  async delete(id: string): Promise<PurchaseOrderDocument | null> {
    return this.purchaseOrderModel.findByIdAndDelete(id).exec();
  }
}
