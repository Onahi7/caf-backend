import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type RecurringInvoiceDocument = RecurringInvoice & Document;

export enum RecurringCadence {
  WEEKLY = 'weekly',
  BIWEEKLY = 'biweekly',
  MONTHLY = 'monthly',
  QUARTERLY = 'quarterly',
}

@Schema({ timestamps: true, collection: 'recurring_invoices' })
export class RecurringInvoice {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  createdBy!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Branch', required: true, index: true })
  branchId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Customer', required: true, index: true })
  customerId!: Types.ObjectId;

  @Prop()
  customerName?: string;

  @Prop({ required: true })
  description!: string;

  // Line items (lightweight, no need to populate from products)
  @Prop({
    type: [
      {
        productId: { type: Types.ObjectId, ref: 'Product' },
        productName: { type: String, required: true },
        sku: { type: String },
        quantity: { type: Number, required: true },
        unitPrice: { type: Number, required: true },
        subtotal: { type: Number, required: true },
        _id: false,
      },
    ],
    required: true,
  })
  items!: Array<{
    productId?: Types.ObjectId;
    productName: string;
    sku?: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
  }>;

  @Prop({ required: true })
  total!: number;

  @Prop({ required: true, default: 0 })
  discount!: number;

  @Prop({ enum: RecurringCadence, required: true })
  cadence!: RecurringCadence;

  @Prop({ required: true })
  nextRunAt!: Date;

  @Prop()
  lastRunAt?: Date;

  @Prop({ default: 0 })
  runCount!: number;

  @Prop({ default: true })
  active!: boolean;

  // Cap number of runs (0 = unlimited)
  @Prop({ default: 0 })
  maxRuns!: number;

  @Prop()
  endDate?: Date;
}

export const RecurringInvoiceSchema = SchemaFactory.createForClass(RecurringInvoice);
RecurringInvoiceSchema.index({ active: 1, nextRunAt: 1 });
