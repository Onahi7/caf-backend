import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type FinanceTransactionDocument = FinanceTransaction & Document;

export enum FinanceTransactionType {
  CASH_IN = 'cash_in',
  CASH_OUT = 'cash_out',
  EXPENSE = 'expense',
  MARKETER_REMITTANCE = 'marketer_remittance',
}

@Schema({ timestamps: true })
export class FinanceTransaction {
  @Prop({ type: Types.ObjectId, ref: 'Branch', required: true, index: true })
  branchId!: Types.ObjectId;

  @Prop({
    required: true,
    enum: Object.values(FinanceTransactionType),
    type: String,
    index: true,
  })
  type!: FinanceTransactionType;

  @Prop({ required: true, min: 0.01 })
  amount!: number;

  @Prop({ required: true, trim: true, maxlength: 100, index: true })
  category!: string;

  @Prop({ trim: true, maxlength: 500 })
  description?: string;

  @Prop({ trim: true, maxlength: 120 })
  reference?: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  recordedBy!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', index: true })
  marketerId?: Types.ObjectId;

  @Prop({ type: Date, required: true, default: () => new Date(), index: true })
  transactionDate!: Date;

  @Prop({ default: false })
  isDeleted!: boolean;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  deletedBy?: Types.ObjectId;

  @Prop()
  deletedAt?: Date;

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}

export const FinanceTransactionSchema =
  SchemaFactory.createForClass(FinanceTransaction);

FinanceTransactionSchema.index({ branchId: 1, transactionDate: -1 });
FinanceTransactionSchema.index({ type: 1, transactionDate: -1 });
FinanceTransactionSchema.index({ marketerId: 1, transactionDate: -1 });
FinanceTransactionSchema.index({ recordedBy: 1, transactionDate: -1 });
FinanceTransactionSchema.index({ isDeleted: 1, transactionDate: -1 });
