import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type DeliveryNoteDocument = DeliveryNote & Document;

export enum DeliveryStatus {
  PENDING = 'pending',
  DELIVERED = 'delivered',
  PARTIAL = 'partial',
}

@Schema()
export class DeliveryNoteItem {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Product' })
  productId!: Types.ObjectId;

  @Prop({ required: true })
  productName!: string;

  @Prop({ required: true })
  quantity!: number;
}

export const DeliveryNoteItemSchema = SchemaFactory.createForClass(DeliveryNoteItem);

@Schema({ timestamps: true })
export class DeliveryNote {
  @Prop({ required: true, unique: true, index: true })
  deliveryNumber!: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'ProformaInvoice', index: true })
  proformaInvoiceId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Sale' })
  saleId?: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Customer', index: true })
  customerId!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Branch', index: true })
  branchId!: Types.ObjectId;

  @Prop({ required: true, type: [DeliveryNoteItemSchema] })
  items!: DeliveryNoteItem[];

  @Prop({ required: true, enum: DeliveryStatus, default: DeliveryStatus.PENDING })
  status!: DeliveryStatus;

  @Prop()
  deliveredAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  deliveredBy?: Types.ObjectId;

  @Prop()
  notes?: string;

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}

export const DeliveryNoteSchema = SchemaFactory.createForClass(DeliveryNote);
DeliveryNoteSchema.index({ branchId: 1, createdAt: -1 });
DeliveryNoteSchema.index({ proformaInvoiceId: 1 });
