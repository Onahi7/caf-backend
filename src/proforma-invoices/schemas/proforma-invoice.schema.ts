import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ProformaInvoiceDocument = ProformaInvoice & Document;

export enum ProformaStatus {
  DRAFT = 'draft',
  PENDING_APPROVAL = 'pending_approval',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  CONVERTED = 'converted',
}

export enum PaymentStatus {
  UNPAID = 'unpaid',
  PARTIAL = 'partial',
  PAID = 'paid',
}

export enum PaymentMethod {
  CASH = 'cash',
  CHEQUE = 'cheque',
  CREDIT = 'credit',
}

@Schema()
export class ProformaItem {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Product' })
  productId!: Types.ObjectId;

  @Prop({ required: true })
  productName!: string;

  @Prop({ required: true })
  quantity!: number;

  @Prop({ required: true })
  unitPrice!: number;

  @Prop({ required: true })
  total!: number;
}

export const ProformaItemSchema = SchemaFactory.createForClass(ProformaItem);

@Schema()
export class PaymentEntry {
  @Prop({ required: true })
  amount!: number;

  @Prop({ required: true, enum: PaymentMethod })
  method!: PaymentMethod;

  @Prop()
  reference?: string;

  @Prop({ required: true, default: () => new Date() })
  paidAt!: Date;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  receivedBy!: Types.ObjectId;
}

export const PaymentEntrySchema = SchemaFactory.createForClass(PaymentEntry);

@Schema({ timestamps: true })
export class ProformaInvoice {
  @Prop({ required: true, unique: true, index: true })
  proformaNumber!: string;

  @Prop({ type: Types.ObjectId, ref: 'CustomerOrder' })
  customerOrderId?: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Customer', index: true })
  customerId!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Branch', index: true })
  branchId!: Types.ObjectId;

  @Prop({ required: true, type: [ProformaItemSchema] })
  items!: ProformaItem[];

  @Prop({ required: true })
  subtotal!: number;

  @Prop({ required: true, default: 0 })
  taxRate!: number;

  @Prop({ required: true, default: 0 })
  taxAmount!: number;

  @Prop({ required: true })
  total!: number;

  @Prop({ required: true })
  validUntil!: Date;

  @Prop({ required: true, enum: ProformaStatus, default: ProformaStatus.DRAFT })
  status!: ProformaStatus;

  @Prop({ required: true, enum: PaymentStatus, default: PaymentStatus.UNPAID })
  paymentStatus!: PaymentStatus;

  @Prop({ type: [PaymentEntrySchema], default: [] })
  payments!: PaymentEntry[];

  @Prop({ type: Types.ObjectId, ref: 'Sale' })
  saleId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  approvedBy?: Types.ObjectId;

  @Prop()
  approvedAt?: Date;

  @Prop()
  rejectedReason?: string;

  @Prop()
  notes?: string;

  @Prop()
  terms?: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  createdBy!: Types.ObjectId;

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}

export const ProformaInvoiceSchema = SchemaFactory.createForClass(ProformaInvoice);
ProformaInvoiceSchema.index({ branchId: 1, createdAt: -1 });
ProformaInvoiceSchema.index({ status: 1, branchId: 1 });
ProformaInvoiceSchema.index({ customerId: 1 });
