import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SalaryDocument = Salary & Document;

export enum SalaryStatus {
  DRAFT = 'draft',
  PENDING_APPROVAL = 'pending_approval',
  APPROVED = 'approved',
  PAID = 'paid',
}

@Schema({ timestamps: true })
export class Salary {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  employeeId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Branch', required: true, index: true })
  branchId!: Types.ObjectId;

  @Prop({ required: true, index: true })
  period!: string;

  @Prop({ required: true, min: 0 })
  baseSalary!: number;

  @Prop({ default: 0, min: 0 })
  allowances!: number;

  @Prop({ default: 0, min: 0 })
  deductions!: number;

  @Prop({ required: true })
  netSalary!: number;

  @Prop({ default: 'bank_transfer' })
  paymentMethod!: string;

  @Prop()
  paymentDate?: Date;

  @Prop({ required: true, enum: SalaryStatus, default: SalaryStatus.DRAFT })
  status!: SalaryStatus;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  approvedBy?: Types.ObjectId;

  @Prop()
  approvedAt?: Date;

  @Prop({ maxlength: 1000 })
  notes?: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  createdBy!: Types.ObjectId;

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}

export const SalarySchema = SchemaFactory.createForClass(Salary);
SalarySchema.index({ employeeId: 1, period: -1 });
SalarySchema.index({ branchId: 1, period: -1 });
SalarySchema.index({ status: 1, branchId: 1 });
