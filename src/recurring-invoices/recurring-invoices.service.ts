import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  RecurringInvoice,
  RecurringInvoiceDocument,
  RecurringCadence,
} from './schemas/recurring-invoice.schema.js';
import {
  CreateRecurringInvoiceDto,
  UpdateRecurringInvoiceDto,
} from './dto/recurring-invoice.dto.js';

@Injectable()
export class RecurringInvoicesService {
  constructor(
    @InjectModel(RecurringInvoice.name)
    private readonly model: Model<RecurringInvoiceDocument>,
  ) {}

  /**
   * List recurring invoices for a branch (or all for super_admin)
   */
  async list(
    userId: string,
    branchId: string | undefined,
    options: { activeOnly?: boolean } = {},
  ): Promise<RecurringInvoiceDocument[]> {
    const filter: Record<string, unknown> = { createdBy: new Types.ObjectId(userId) };
    if (branchId) {
      filter.branchId = new Types.ObjectId(branchId);
    }
    if (options.activeOnly) filter.active = true;
    return this.model.find(filter).sort({ nextRunAt: 1 }).exec();
  }

  async get(id: string, userId: string): Promise<RecurringInvoiceDocument> {
    const doc = await this.model
      .findOne({ _id: new Types.ObjectId(id), createdBy: new Types.ObjectId(userId) })
      .exec();
    if (!doc) throw new NotFoundException('Recurring invoice not found');
    return doc;
  }

  async create(
    userId: string,
    dto: CreateRecurringInvoiceDto,
  ): Promise<RecurringInvoiceDocument> {
    return this.model.create({
      createdBy: new Types.ObjectId(userId),
      branchId: new Types.ObjectId(dto.branchId),
      customerId: new Types.ObjectId(dto.customerId),
      customerName: dto.customerName,
      description: dto.description,
      items: dto.items.map((i) => ({
        productId: i.productId ? new Types.ObjectId(i.productId) : undefined,
        productName: i.productName,
        sku: i.sku,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        subtotal: i.subtotal,
      })),
      total: dto.total,
      discount: dto.discount ?? 0,
      cadence: dto.cadence,
      nextRunAt: new Date(dto.nextRunAt),
      maxRuns: dto.maxRuns ?? 0,
      endDate: dto.endDate ? new Date(dto.endDate) : undefined,
    });
  }

  async update(
    id: string,
    userId: string,
    dto: UpdateRecurringInvoiceDto,
  ): Promise<RecurringInvoiceDocument> {
    const update: Record<string, unknown> = {};
    if (dto.description !== undefined) update.description = dto.description;
    if (dto.items !== undefined) {
      update.items = dto.items.map((i) => ({
        productId: i.productId ? new Types.ObjectId(i.productId) : undefined,
        productName: i.productName,
        sku: i.sku,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        subtotal: i.subtotal,
      }));
    }
    if (dto.total !== undefined) update.total = dto.total;
    if (dto.discount !== undefined) update.discount = dto.discount;
    if (dto.cadence !== undefined) update.cadence = dto.cadence;
    if (dto.nextRunAt !== undefined) update.nextRunAt = new Date(dto.nextRunAt);
    if (dto.active !== undefined) update.active = dto.active;
    if (dto.maxRuns !== undefined) update.maxRuns = dto.maxRuns;
    if (dto.endDate !== undefined) update.endDate = new Date(dto.endDate);

    const doc = await this.model
      .findOneAndUpdate(
        { _id: new Types.ObjectId(id), createdBy: new Types.ObjectId(userId) },
        { $set: update },
        { new: true },
      )
      .exec();
    if (!doc) throw new NotFoundException('Recurring invoice not found');
    return doc;
  }

  async remove(id: string, userId: string): Promise<void> {
    const res = await this.model
      .deleteOne({ _id: new Types.ObjectId(id), createdBy: new Types.ObjectId(userId) })
      .exec();
    if (res.deletedCount === 0) {
      throw new NotFoundException('Recurring invoice not found');
    }
  }

  /**
   * Compute the next run date from a base date and cadence.
   */
  static computeNextRunAt(from: Date, cadence: RecurringCadence): Date {
    const next = new Date(from);
    switch (cadence) {
      case RecurringCadence.WEEKLY:
        next.setDate(next.getDate() + 7);
        break;
      case RecurringCadence.BIWEEKLY:
        next.setDate(next.getDate() + 14);
        break;
      case RecurringCadence.MONTHLY:
        next.setMonth(next.getMonth() + 1);
        break;
      case RecurringCadence.QUARTERLY:
        next.setMonth(next.getMonth() + 3);
        break;
    }
    return next;
  }

  /**
   * Mark a recurring invoice as having been run now.
   * Returns null if the schedule is exhausted (maxRuns reached, endDate passed, or inactive).
   */
  async recordRun(
    id: string,
  ): Promise<{ nextRunAt: Date; runCount: number; shouldDeactivate: boolean } | null> {
    const doc = await this.model.findById(new Types.ObjectId(id)).exec();
    if (!doc) throw new NotFoundException('Recurring invoice not found');
    if (!doc.active) return null;

    const now = new Date();
    if (doc.endDate && now > doc.endDate) {
      doc.active = false;
      await doc.save();
      return null;
    }
    if (doc.maxRuns > 0 && doc.runCount >= doc.maxRuns) {
      doc.active = false;
      await doc.save();
      return null;
    }

    const next = RecurringInvoicesService.computeNextRunAt(now, doc.cadence);
    doc.lastRunAt = now;
    doc.runCount = doc.runCount + 1;
    doc.nextRunAt = next;
    const shouldDeactivate = doc.maxRuns > 0 && doc.runCount >= doc.maxRuns;
    if (shouldDeactivate) doc.active = false;
    await doc.save();

    return { nextRunAt: next, runCount: doc.runCount, shouldDeactivate };
  }

  /**
   * Returns the data needed to create a Sale from this template.
   * Caller (typically CheckoutService) is responsible for actual sale creation.
   */
  toSaleTemplate(doc: RecurringInvoiceDocument) {
    return {
      branchId: doc.branchId.toString(),
      customerId: doc.customerId.toString(),
      customerName: doc.customerName,
      items: doc.items.map((i) => ({
        productId: i.productId?.toString(),
        productName: i.productName,
        sku: i.sku,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        subtotal: i.subtotal,
      })),
      total: doc.total,
      discount: doc.discount,
      notes: `Recurring invoice: ${doc.description} (run #${doc.runCount + 1})`,
    };
  }

  async validateOwnership(id: string, userId: string) {
    const doc = await this.model
      .findOne({ _id: new Types.ObjectId(id), createdBy: new Types.ObjectId(userId) })
      .lean()
      .exec();
    if (!doc) throw new NotFoundException('Recurring invoice not found');
    return doc;
  }

  async assertCanEdit(id: string, userId: string) {
    await this.validateOwnership(id, userId);
    const doc = await this.model.findById(new Types.ObjectId(id)).exec();
    if (!doc) throw new BadRequestException('Template not found');
    return doc;
  }
}
