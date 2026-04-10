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
  ORANGE_MONEY = 'orange_money',
  AFRICELL_MONEY = 'africell_money',
  QMONEY = 'qmoney',
  BANK_TRANSFER = 'bank_transfer',
  // Legacy payment methods (kept for backward compatibility)
  MOBILE = 'mobile',
  INSURANCE = 'insurance',
  SPLIT = 'split',
}

/**
 * Sale item embedded document
 * Represents a single item in a sale
 */
@Schema({ _id: false })
export class SaleItem {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Product' })
  productId!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Batch' })
  batchId!: Types.ObjectId;

  @Prop({ required: true })
  quantity!: number;

  @Prop({ required: true })
  unitPrice!: number;

  @Prop({ required: true })
  subtotal!: number;

  @Prop()
  lotNumber?: string;

  @Prop()
  expiryDate?: Date;

  /**
   * Track returned quantity for partial returns
   * Property 47: Partial return support
   */
  @Prop({ default: 0 })
  returnedQuantity!: number;
}

export const SaleItemSchema = SchemaFactory.createForClass(SaleItem);

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

  @Prop({ required: true })
  total!: number;

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
