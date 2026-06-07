import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CashEntryDocument = CashEntry & Document;

export enum CashEntryType {
  INCOME = 'income',
  EXPENSE = 'expense',
  TRANSFER = 'transfer',
  LOAN = 'loan',
  SALARY = 'salary',
  ADVANCE = 'advance',
  OTHER = 'other',
}

export enum CashEntryCategory {
  SALES = 'sales',
  SERVICES = 'services',
  SUPPLIES = 'supplies',
  MAINTENANCE = 'maintenance',
  UTILITIES = 'utilities',
  RENT = 'rent',
  SALARIES = 'salaries',
  TRANSPORT = 'transport',
  MARKETING = 'marketing',
  INSURANCE = 'insurance',
  TAX = 'tax',
  PETTY_CASH = 'petty_cash',
  STAFF_ADVANCE = 'staff_advance',
  OTHER = 'other',
}

@Schema({ timestamps: true })
export class CashEntry {
  @Prop({ required: true, enum: CashEntryType, index: true })
  type!: CashEntryType;

  @Prop({ required: true, enum: CashEntryCategory, index: true })
  category!: CashEntryCategory;

  @Prop({ type: Types.ObjectId, ref: 'Branch', required: true, index: true })
  branchId!: Types.ObjectId;

  @Prop({ required: true, min: 0 })
  amount!: number;

  @Prop({ required: true, maxlength: 500 })
  description!: string;

  @Prop({ maxlength: 1000 })
  notes?: string;

  @Prop({ maxlength: 200 })
  receiptNumber?: string;

  @Prop({ maxlength: 200 })
  referenceId?: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  recordedBy!: Types.ObjectId;

  @Prop({ default: Date.now })
  entryDate!: Date;

  @Prop({ default: true })
  isActive!: boolean;

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}

export const CashEntrySchema = SchemaFactory.createForClass(CashEntry);
CashEntrySchema.index({ branchId: 1, type: 1, entryDate: -1 });
CashEntrySchema.index({ branchId: 1, category: 1, entryDate: -1 });
CashEntrySchema.index({ entryDate: -1 });
