import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SaleDocument = Sale & Document;

/**
 * Sale status enum
 * Requirements: 6.4, 11.1, 11.4, 11.5
 */
export enum SaleStatus {
  COMPLETED = 'completed',
  RETURNED = 'returned',
  PARTIALLY_RETURNED = 'partially_returned',
}

/**
 * Payment method enum
 * Requirements: 6.3, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6
 * Property 23: Payment method support
 * Property 7: Payment method validation
 */
export enum PaymentMethod {
  CASH = 'cash',
  CARD = 'card',
  CREDIT = 'credit',
  ORANGE_MONEY = 'orange_money',
  AFRICELL_MONEY = 'africell_money',
  QMONEY = 'qmoney',
  BANK_TRANSFER = 'bank_transfer',
  // Legacy payment methods (kept for backward compatibility)
  MOBILE = 'mobile',
  INSURANCE = 'insurance',
  SPLIT = 'split',
}

export enum SaleType {
  CASH = 'cash',
  CREDIT = 'credit',
}

export enum PaymentStatus {
  UNPAID = 'unpaid',
  PARTIAL = 'partial',
  PAID = 'paid',
  OVERDUE = 'overdue',
}

@Schema({ _id: false })
export class SaleItemPackSize {
  @Prop()
  code?: string;

  @Prop({ required: true })
  name!: string;

  @Prop({ required: true })
  unit!: string;

  @Prop({ required: true })
  quantityPerPack!: number;

  @Prop()
  barcode?: string;
}

export const SaleItemPackSizeSchema = SchemaFactory.createForClass(SaleItemPackSize);

/**
 * Sale item embedded document
 * Represents a single item in a sale
 */
@Schema({ _id: false })
export class SaleItem {
  @Prop({ required: true, default: () => new Types.ObjectId().toString() })
  saleItemId!: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Product' })
  productId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Batch' })
  batchId?: Types.ObjectId;

  @Prop({ required: true })
  quantity!: number;

  @Prop({ required: true })
  unitPrice!: number;

  @Prop({ required: true })
  subtotal!: number;

  /**
   * Pack size info for unit conversion tracking
   */
  @Prop({ type: SaleItemPackSizeSchema })
  packSize?: SaleItemPackSize;

  /**
   * Track returned quantity for partial returns
   * Property 47: Partial return support
   */
  @Prop({ default: 0 })
  returnedQuantity!: number;
}

export const SaleItemSchema = SchemaFactory.createForClass(SaleItem);

@Schema({ _id: false })
export class SalePaymentEntry {
  @Prop()
  paymentReceiptNumber?: string;

  @Prop({ required: true })
  amount!: number;

  @Prop({ required: true, enum: PaymentMethod, type: String })
  paymentMethod!: PaymentMethod;

  @Prop()
  paymentReference?: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  receivedBy?: Types.ObjectId;

  @Prop({ default: Date.now })
  receivedAt!: Date;

  @Prop()
  notes?: string;

  @Prop({ default: false })
  isInitialPayment!: boolean;

  @Prop()
  balanceAfterPayment?: number;
}

export const SalePaymentEntrySchema =
  SchemaFactory.createForClass(SalePaymentEntry);

@Schema({ _id: false })
export class SaleRefundEntry {
  @Prop({ required: true })
  amount!: number;

  @Prop({ required: true, enum: PaymentMethod, type: String })
  paymentMethod!: PaymentMethod;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  processedBy!: Types.ObjectId;

  @Prop({ default: Date.now })
  processedAt!: Date;

  @Prop()
  reason?: string;
}

export const SaleRefundEntrySchema = SchemaFactory.createForClass(SaleRefundEntry);

/**
 * Prescription verification status
 * Requirements: 22.4
 * Property 81: Prescription verification status
 */
export enum PrescriptionStatus {
  PENDING = 'pending',
  VERIFIED = 'verified',
  REJECTED = 'rejected',
}

/**
 * Sale Schema
 * Records all sales transactions with full details
 * Requirements: 6.3, 6.4, 6.5, 7.5, 11.1, 11.4, 11.5, 22.1, 22.3, 22.4
 * Properties: 23, 24, 25, 30, 44, 47, 48, 79, 80, 81
 */
@Schema({ timestamps: true })
export class Sale {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Branch', index: true })
  branchId!: Types.ObjectId;

  /**
   * Property 30: Sales-shift association
   */
  @Prop({ required: true, type: Types.ObjectId, ref: 'Shift', index: true })
  shiftId!: Types.ObjectId;

  @Prop({ required: true })
  terminalId!: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User', index: true })
  cashierId!: Types.ObjectId;

  /**
   * Sale items array
   * Property 24: Receipt completeness
   */
  @Prop({ required: true, type: [SaleItemSchema] })
  items!: SaleItem[];

  @Prop({ required: true })
  subtotal!: number;

  @Prop({ default: 0 })
  discount!: number;

  @Prop({ default: 0 })
  manualDiscount!: number;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  manualDiscountBy?: Types.ObjectId;

  @Prop()
  manualDiscountAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'Promotion' })
  promotionId?: Types.ObjectId;

  @Prop({ default: 0 })
  taxAmount!: number;

  @Prop({ type: [Object], default: [] })
  taxBreakdown!: Array<{ name: string; amount: number }>;

  @Prop({ required: true })
  total!: number;

  @Prop({
    required: true,
    enum: SaleType,
    type: String,
    default: SaleType.CASH,
  })
  saleType!: SaleType;

  /**
   * Property 23: Payment method support
   */
  @Prop({ required: true, enum: PaymentMethod, type: String })
  paymentMethod!: PaymentMethod;

  /**
   * Property 78: Payment details recording
   * Property 13: Mobile money reference storage
   * Property 15: Optional mobile money reference
   * Requirements: 6.1, 6.3
   *
   * Stores transaction reference numbers for mobile money payments
   * (Orange Money, Africell Money, QMoney) and other electronic payments
   */
  @Prop()
  paymentReference?: string;

  @Prop({
    required: true,
    enum: PaymentStatus,
    type: String,
    default: PaymentStatus.PAID,
  })
  paymentStatus!: PaymentStatus;

  @Prop({ default: 0 })
  amountPaid!: number;

  @Prop({ default: 0 })
  balanceDue!: number;

  @Prop()
  dueDate?: Date;

  @Prop({ type: [SalePaymentEntrySchema], default: [] })
  payments!: SalePaymentEntry[];

  @Prop({ type: [SaleRefundEntrySchema], default: [] })
  refunds!: SaleRefundEntry[];

  /**
   * Property 25, 80: Prescription attachment and association
   */
  @Prop()
  prescriptionUrl?: string;

  /**
   * Property 81: Prescription verification status
   */
  @Prop({ enum: PrescriptionStatus, type: String })
  prescriptionStatus?: PrescriptionStatus;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  prescriptionVerifiedBy?: Types.ObjectId;

  @Prop()
  prescriptionVerifiedAt?: Date;

  /**
   * Property 48: Sale record update on return
   */
  @Prop({
    required: true,
    enum: SaleStatus,
    type: String,
    default: SaleStatus.COMPLETED,
  })
  status!: SaleStatus;

  /**
   * Amount returned for partial/full returns
   */
  @Prop({ default: 0 })
  returnedAmount!: number;

  /**
   * Receipt number for display
   */
  @Prop({ required: true, unique: true, index: true })
  receiptNumber!: string;

  /**
   * Customer information (optional)
   */
  @Prop()
  customerName?: string;

  @Prop()
  customerPhone?: string;

  @Prop({ type: Types.ObjectId, ref: 'Customer', index: true })
  customerId?: Types.ObjectId;

  /**
   * Patient linkage (for EMR/LAB pharmacy sales)
   */
  @Prop()
  patientId?: string;

  @Prop()
  patientName?: string;

  @Prop()
  sourceSystem?: string;

  @Prop()
  notes?: string;

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}

export const SaleSchema = SchemaFactory.createForClass(Sale);

// Compound indexes for efficient queries
SaleSchema.index({ branchId: 1, createdAt: -1 });
SaleSchema.index({ shiftId: 1, createdAt: -1 });
SaleSchema.index({ cashierId: 1, createdAt: -1 });
SaleSchema.index({ branchId: 1, status: 1 });
SaleSchema.index({ branchId: 1, saleType: 1, paymentStatus: 1 });
SaleSchema.index({ terminalId: 1 });
