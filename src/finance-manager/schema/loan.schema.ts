import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type LoanDocument = Loan & Document;

export enum LoanDirection {
  RECEIVED = 'received',
  GIVEN = 'given',
}

export enum LoanStatus {
  ACTIVE = 'active',
  FULLY_REPAID = 'fully_repaid',
  WRITTEN_OFF = 'written_off',
  CANCELLED = 'cancelled',
}

export enum RepaymentFrequency {
  MONTHLY = 'monthly',
  QUARTERLY = 'quarterly',
  LUMP_SUM = 'lump_sum',
  CUSTOM = 'custom',
}

@Schema({ _id: false })
export class LoanRepayment {
  @Prop({ required: true })
  amount!: number;

  @Prop({ required: true })
  principalAmount!: number;

  @Prop({ required: true })
  interestAmount!: number;

  @Prop({ required: true })
  paymentDate!: Date;

  @Prop({ type: Types.ObjectId, ref: 'CashEntry' })
  cashEntryId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  recordedBy?: Types.ObjectId;

  @Prop({ maxlength: 500 })
  notes?: string;
}

export const LoanRepaymentSchema = SchemaFactory.createForClass(LoanRepayment);

@Schema({ timestamps: true })
export class Loan {
  @Prop({ required: true, maxlength: 100 })
  referenceNumber!: string;

  @Prop({ required: true, enum: LoanDirection })
  direction!: LoanDirection;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Branch', index: true })
  branchId!: Types.ObjectId;

  @Prop({ required: true, maxlength: 200 })
  counterpartyName!: string;

  @Prop({ maxlength: 200 })
  counterpartyContact?: string;

  @Prop({ required: true, min: 0 })
  principalAmount!: number;

  @Prop({ required: true, min: 0 })
  outstandingPrincipal!: number;

  @Prop({ required: true, min: 0, max: 100 })
  interestRatePercent!: number;

  @Prop({ required: true, default: 0, min: 0 })
  totalInterestAccrued!: number;

  @Prop({ required: true, default: 0, min: 0 })
  totalInterestPaid!: number;

  @Prop({ required: true, default: 0, min: 0 })
  totalPrincipalPaid!: number;

  @Prop({ required: true })
  startDate!: Date;

  @Prop()
  endDate?: Date;

  @Prop({ required: true, default: 1, min: 1 })
  termMonths!: number;

  @Prop({ required: true, enum: RepaymentFrequency, default: RepaymentFrequency.MONTHLY })
  repaymentFrequency!: RepaymentFrequency;

  @Prop({ required: true, enum: LoanStatus, default: LoanStatus.ACTIVE, index: true })
  status!: LoanStatus;

  @Prop({ type: [LoanRepaymentSchema], default: [] })
  repayments!: LoanRepayment[];

  @Prop({ maxlength: 1000 })
  purpose?: string;

  @Prop({ maxlength: 200 })
  collateral?: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  coSignedBy?: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  createdBy!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  approvedBy?: Types.ObjectId;

  @Prop()
  approvedAt?: Date;

  @Prop()
  closedAt?: Date;

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}

export const LoanSchema = SchemaFactory.createForClass(Loan);
LoanSchema.index({ branchId: 1, status: 1 });
LoanSchema.index({ direction: 1, status: 1 });
LoanSchema.index({ referenceNumber: 1 }, { unique: true });
LoanSchema.index({ startDate: -1 });
