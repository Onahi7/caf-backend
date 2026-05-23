import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CustomerOrder, CustomerOrderDocument } from './schemas/customer-order.schema.js';

@Injectable()
export class CustomerOrdersRepository {
  constructor(
    @InjectModel(CustomerOrder.name) private readonly model: Model<CustomerOrderDocument>,
  ) {}

  async generateOrderNumber(_branchId: string): Promise<string> {
    const today = new Date();
    const prefix = `PO-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}-`;
    const count = await this.model.countDocuments({
      orderNumber: { $regex: `^${prefix}` },
    });
    return `${prefix}${String(count + 1).padStart(5, '0')}`;
  }

  async create(data: Partial<CustomerOrder>): Promise<CustomerOrderDocument> {
    return this.model.create(data);
  }

  async findById(id: string): Promise<CustomerOrderDocument | null> {
    return this.model.findById(id).populate('createdBy', 'firstName lastName username').exec();
  }

  async findAll(filter: Record<string, any> = {}): Promise<CustomerOrderDocument[]> {
    return this.model
      .find(filter)
      .sort({ createdAt: -1 })
      .populate('createdBy', 'firstName lastName username')
      .exec();
  }

  async update(id: string, data: Partial<CustomerOrder>): Promise<CustomerOrderDocument | null> {
    return this.model.findByIdAndUpdate(id, { $set: data }, { new: true }).exec();
  }

  async delete(id: string): Promise<CustomerOrderDocument | null> {
    return this.model.findByIdAndDelete(id).exec();
  }
}
