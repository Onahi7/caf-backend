import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ReconciliationDocument = Reconciliation & Document;

export enum ReconciliationSource {
  CAF = 'caf',
  EMR = 'emr',
  LAB = 'lab',
}

export enum ReconciliationStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

@Schema({ _id: false })
export class ReconciliationItem {
  @Prop({ required: true })
  description!: string;

  @Prop({ required: true, min: 0 })
  amount!: number;

  @Prop()
  reference?: string;
}

export const ReconciliationItemSchema = SchemaFactory.createForClass(ReconciliationItem);

@Schema({ timestamps: true })
export class Reconciliation {
  @Prop({ required: true, enum: ReconciliationSource, index: true })
  source!: ReconciliationSource;

  @Prop({ type: Types.ObjectId, ref: 'Branch', required: true, index: true })
  branchId!: Types.ObjectId;

  @Prop({ required: true, index: true })
  period!: string;

  @Prop({ required: true, min: 0 })
  totalSales!: number;

  @Prop({ required: true, min: 0 })
  totalExpenses!: number;

  @Prop({ required: true })
  expectedCash!: number;

  @Prop({ required: true, min: 0 })
  actualCash!: number;

  @Prop({ required: true })
  discrepancy!: number;

  @Prop({ default: false })
  hasDiscrepancy!: boolean;

  @Prop({ required: true, enum: ReconciliationStatus, default: ReconciliationStatus.PENDING })
  status!: ReconciliationStatus;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  reviewedBy?: Types.ObjectId;

  @Prop()
  reviewedAt?: Date;

  @Prop({ maxlength: 1000 })
  reviewNotes?: string;

  @Prop({ type: [ReconciliationItemSchema], default: [] })
  items!: ReconciliationItem[];

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  createdBy!: Types.ObjectId;

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}

export const ReconciliationSchema = SchemaFactory.createForClass(Reconciliation);
ReconciliationSchema.index({ branchId: 1, source: 1, period: -1 });
ReconciliationSchema.index({ status: 1, branchId: 1 });
