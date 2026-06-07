import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type EmployeeAdvanceDocument = EmployeeAdvance & Document;

export enum AdvanceStatus {
  OUTSTANDING = 'outstanding',
  PARTIALLY_SETTLED = 'partially_settled',
  FULLY_SETTLED = 'fully_settled',
  WRITTEN_OFF = 'written_off',
}

export enum AdvanceType {
  GOODS = 'goods',
  CASH = 'cash',
}

export enum RepaymentType {
  SALARY_DEDUCTION = 'salary_deduction',
  CASH_REPAYMENT = 'cash_repayment',
  GOODS_RETURN = 'goods_return',
}

@Schema({ _id: false })
export class AdvanceRepayment {
  @Prop({ required: true })
  amount!: number;

  @Prop({ required: true, enum: RepaymentType })
  type!: RepaymentType;

  @Prop({ type: Types.ObjectId, ref: 'Salary' })
  salaryId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'CashEntry' })
  cashEntryId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Sale' })
  returnSaleId?: Types.ObjectId;

  @Prop({ required: true })
  repaymentDate!: Date;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  recordedBy!: Types.ObjectId;

  @Prop({ maxlength: 500 })
  notes?: string;
}

export const AdvanceRepaymentSchema = SchemaFactory.createForClass(AdvanceRepayment);

@Schema({ _id: false })
export class AdvanceItem {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Product' })
  productId!: Types.ObjectId;

  @Prop({ maxlength: 200 })
  productName?: string;

  @Prop({ type: Types.ObjectId, ref: 'Batch' })
  batchId?: Types.ObjectId;

  @Prop({ required: true, min: 0 })
  quantity!: number;

  @Prop({ required: true, min: 0 })
  unitPrice!: number;

  @Prop({ required: true, min: 0 })
  subtotal!: number;
}

export const AdvanceItemSchema = SchemaFactory.createForClass(AdvanceItem);

@Schema({ timestamps: true })
export class EmployeeAdvance {
  @Prop({ required: true, maxlength: 100 })
  referenceNumber!: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User', index: true })
  employeeId!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Branch', index: true })
  branchId!: Types.ObjectId;

  @Prop({ required: true, enum: AdvanceType })
  type!: AdvanceType;

  @Prop({ required: true, min: 0 })
  totalAmount!: number;

  @Prop({ required: true, min: 0 })
  outstandingAmount!: number;

  @Prop({ default: 0, min: 0 })
  totalCost!: number;

  @Prop({ required: true, enum: AdvanceStatus, default: AdvanceStatus.OUTSTANDING, index: true })
  status!: AdvanceStatus;

  @Prop({ type: [AdvanceItemSchema], default: [] })
  items!: AdvanceItem[];

  @Prop({ type: Types.ObjectId, ref: 'Sale' })
  sourceSaleId?: Types.ObjectId;

  @Prop({ type: [AdvanceRepaymentSchema], default: [] })
  repayments!: AdvanceRepayment[];

  @Prop({ required: true })
  advanceDate!: Date;

  @Prop({ maxlength: 1000 })
  notes?: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  coSignedBy?: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  createdBy!: Types.ObjectId;

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}

export const EmployeeAdvanceSchema = SchemaFactory.createForClass(EmployeeAdvance);
EmployeeAdvanceSchema.index({ branchId: 1, status: 1 });
EmployeeAdvanceSchema.index({ employeeId: 1, status: 1 });
EmployeeAdvanceSchema.index({ referenceNumber: 1 }, { unique: true });
EmployeeAdvanceSchema.index({ advanceDate: -1 });
