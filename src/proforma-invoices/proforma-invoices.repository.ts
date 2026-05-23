import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ProformaInvoice, ProformaInvoiceDocument } from './schemas/proforma-invoice.schema.js';

@Injectable()
export class ProformaInvoicesRepository {
  constructor(
    @InjectModel(ProformaInvoice.name) private readonly model: Model<ProformaInvoiceDocument>,
  ) {}

  async generateProformaNumber(_branchId: string): Promise<string> {
    const today = new Date();
    const prefix = `PF-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}-`;
    const count = await this.model.countDocuments({
      proformaNumber: { $regex: `^${prefix}` },
    });
    return `${prefix}${String(count + 1).padStart(5, '0')}`;
  }

  async create(data: Partial<ProformaInvoice>): Promise<ProformaInvoiceDocument> {
    return this.model.create(data);
  }

  async findById(id: string): Promise<ProformaInvoiceDocument | null> {
    return this.model
      .findById(id)
      .populate('createdBy', 'firstName lastName username')
      .populate('approvedBy', 'firstName lastName username')
      .populate('customerId')
      .populate('saleId')
      .exec();
  }

  async findAll(filter: Record<string, any> = {}): Promise<ProformaInvoiceDocument[]> {
    return this.model
      .find(filter)
      .sort({ createdAt: -1 })
      .populate('createdBy', 'firstName lastName username')
      .populate('customerId')
      .exec();
  }

  async update(id: string, data: Partial<ProformaInvoice>): Promise<ProformaInvoiceDocument | null> {
    return this.model.findByIdAndUpdate(id, { $set: data }, { new: true }).exec();
  }
}
