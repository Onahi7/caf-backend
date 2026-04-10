import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum ExpenseCategory {
  SUPPLIES = 'supplies',
  MAINTENANCE = 'maintenance',
  UTILITIES = 'utilities',
  PETTY_CASH = 'petty_cash',
  OTHER = 'other',
}

export type ExpenseDocument = Expense & Document;

/**
 * Expense Schema
 * Tracks cash expenses during shifts for accounting and reconciliation
 */
@Schema({ timestamps: true })
export class Expense {
  @Prop({ type: Types.ObjectId, ref: 'Branch', required: true })
  branchId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Shift', required: true })
  shiftId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  recordedBy!: Types.ObjectId;

  @Prop({ required: true, min: 0 })
  amount!: number;

  @Prop({ required: true, enum: Object.values(ExpenseCategory) })
  category!: ExpenseCategory;

  @Prop({ required: true, trim: true, maxlength: 500 })
  description!: string;

  @Prop({ trim: true, maxlength: 1000 })
  notes?: string;

  @Prop({ type: String, maxlength: 100 })
  receiptNumber?: string;

  @Prop({ default: false })
  isDeleted!: boolean;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  deletedBy?: Types.ObjectId;

  @Prop()
  deletedAt?: Date;
}

export const ExpenseSchema = SchemaFactory.createForClass(Expense);

// Indexes for efficient queries
ExpenseSchema.index({ branchId: 1, createdAt: -1 });
ExpenseSchema.index({ shiftId: 1 });
ExpenseSchema.index({ recordedBy: 1, createdAt: -1 });
ExpenseSchema.index({ isDeleted: 1 });
