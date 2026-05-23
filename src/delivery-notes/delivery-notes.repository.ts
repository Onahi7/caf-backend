import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { DeliveryNote, DeliveryNoteDocument } from './schemas/delivery-note.schema.js';

@Injectable()
export class DeliveryNotesRepository {
  constructor(
    @InjectModel(DeliveryNote.name) private readonly model: Model<DeliveryNoteDocument>,
  ) {}

  async generateDeliveryNumber(_branchId: string): Promise<string> {
    const today = new Date();
    const prefix = `DN-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}-`;
    const count = await this.model.countDocuments({
      deliveryNumber: { $regex: `^${prefix}` },
    });
    return `${prefix}${String(count + 1).padStart(5, '0')}`;
  }

  async create(data: Partial<DeliveryNote>): Promise<DeliveryNoteDocument> {
    return this.model.create(data);
  }

  async findById(id: string): Promise<DeliveryNoteDocument | null> {
    return this.model.findById(id).populate('customerId').exec();
  }

  async findAll(filter: Record<string, any> = {}): Promise<DeliveryNoteDocument[]> {
    return this.model
      .find(filter)
      .sort({ createdAt: -1 })
      .populate('customerId')
      .exec();
  }

  async update(id: string, data: Partial<DeliveryNote>): Promise<DeliveryNoteDocument | null> {
    return this.model.findByIdAndUpdate(id, { $set: data }, { new: true }).exec();
  }
}
