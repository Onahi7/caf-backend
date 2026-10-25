import { Schema as MongooseSchema } from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { FieldZoneCode } from './field-zone.schema.js';
import { FieldVisitCode } from './field-visit.schema.js';

export type DailyFieldReportDocument = DailyFieldReport & Document;

@Schema({ _id: false })
export class DailyFieldReportStop {
  @Prop({ required: true })
  facility!: string;

  @Prop({ required: true })
  neighbourhood!: string;

  @Prop({ required: true, enum: Object.values(FieldVisitCode), type: String })
  type!: FieldVisitCode;

  @Prop()
  personPhone?: string;

  @Prop()
  soldDiscussed?: string;

  @Prop({ min: 0, default: 0 })
  cash!: number;

  @Prop({ min: 0, default: 0 })
  balance!: number;

  @Prop({ type: Date })
  nextDate?: Date;
}

export const DailyFieldReportStopSchema = SchemaFactory.createForClass(DailyFieldReportStop);

@Schema({ timestamps: true })
export class DailyFieldReport {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true, index: true })
  marketerId!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Branch', required: true, index: true })
  branchId!: Types.ObjectId;

  @Prop({ required: true, enum: Object.values(FieldZoneCode), type: String, index: true })
  zoneCode!: FieldZoneCode;

  @Prop({ required: true, type: Date, index: true })
  reportDate!: Date;

  @Prop({ min: 0 })
  bikeKmStart?: number;

  @Prop({ min: 0 })
  bikeKmEnd?: number;

  @Prop({ min: 0, max: 100 })
  chargeAm?: number;

  @Prop({ min: 0, max: 100 })
  chargePm?: number;

  @Prop({ min: 0, default: 0 })
  cashAtClose!: number;

  // Cash Handover Tracking
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  cashRecipientId?: Types.ObjectId;

  @Prop()
  cashRecipientName?: string;

  @Prop({ min: 0 })
  cashHandoverAmount?: number;

  @Prop({ default: 'cash', enum: ['cash', 'orange_money', 'afrimoney', 'bank_deposit', 'other'] })
  cashHandoverMethod?: string;

  @Prop()
  cashHandoverReference?: string;

  @Prop({ type: Date })
  cashHandoverAt?: Date;

  // Cash Acknowledgement by Admin / Cashier
  @Prop({ default: 'pending', enum: ['pending', 'acknowledged', 'discrepancy', 'rejected'], index: true })
  cashAcknowledgementStatus?: 'pending' | 'acknowledged' | 'discrepancy' | 'rejected';

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  cashAcknowledgedBy?: Types.ObjectId;

  @Prop({ type: Date })
  cashAcknowledgedAt?: Date;

  @Prop({ min: 0 })
  cashAcknowledgedAmount?: number;

  @Prop()
  cashAcknowledgementNotes?: string;

  @Prop({ type: [DailyFieldReportStopSchema], default: [] })
  stops!: DailyFieldReportStop[];

  @Prop()
  harborToday?: string;

  @Prop()
  stockMissing?: string;

  @Prop()
  bikeIssues?: string;

  @Prop()
  tomorrowStopOne?: string;

  @Prop()
  tomorrowStopTwo?: string;

  @Prop({ default: 'draft', enum: ['draft', 'submitted', 'reviewed', 'rejected'], index: true })
  status!: 'draft' | 'submitted' | 'reviewed' | 'rejected';

  @Prop({ type: Date })
  submittedAt?: Date;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  reviewedBy?: Types.ObjectId;

  @Prop({ type: Date })
  reviewedAt?: Date;

  @Prop()
  reviewNotes?: string;

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}

export const DailyFieldReportSchema = SchemaFactory.createForClass(DailyFieldReport);

DailyFieldReportSchema.index({ marketerId: 1, reportDate: 1 }, { unique: true });
DailyFieldReportSchema.index({ branchId: 1, reportDate: -1 });
