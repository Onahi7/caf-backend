import { Schema as MongooseSchema } from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { FieldZoneCode } from './field-zone.schema.js';

export type FieldVisitDocument = FieldVisit & Document;

export enum FieldVisitCode {
  NEW = 'NEW',
  DEMO = 'DEMO',
  SALE = 'SALE',
  REST = 'REST',
  COL = 'COL',
  HRB = 'HRB',
  TRN = 'TRN',
  DEAD = 'DEAD',
}

@Schema({ timestamps: false, _id: false })
export class FieldVisitProductLine {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Product' })
  productId?: Types.ObjectId;

  @Prop({ min: 0 })
  quantity?: number;

  @Prop({ min: 0 })
  unitPrice?: number;

  @Prop()
  description?: string;
}

export const FieldVisitProductLineSchema = SchemaFactory.createForClass(FieldVisitProductLine);

@Schema({ timestamps: true })
export class FieldVisit {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Facility', required: true, index: true })
  facilityId!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true, index: true })
  marketerId!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Branch', required: true, index: true })
  branchId!: Types.ObjectId;

  @Prop({ required: true, enum: Object.values(FieldZoneCode), type: String, index: true })
  zoneCode!: FieldZoneCode;

  @Prop({ required: true, enum: Object.values(FieldVisitCode), type: String, index: true })
  visitType!: FieldVisitCode;

  @Prop({ type: Date, required: true, index: true })
  visitedAt!: Date;

  @Prop()
  personName?: string;

  @Prop()
  personPhone?: string;

  @Prop({ type: [FieldVisitProductLineSchema], default: [] })
  products!: FieldVisitProductLine[];

  @Prop({ min: 0, default: 0 })
  cashCollected!: number;

  @Prop({ min: 0, default: 0 })
  balanceDue!: number;

  @Prop({ type: Date })
  nextActionDate?: Date;

  @Prop()
  nextAction?: string;

  @Prop()
  harborNotes?: string;

  @Prop()
  trainingAttendance?: string;

  @Prop({ type: [String], default: [] })
  photoUrls!: string[];

  @Prop()
  notes?: string;

  @Prop({ default: 'submitted', enum: ['draft', 'submitted', 'reviewed', 'rejected'], index: true })
  status!: 'draft' | 'submitted' | 'reviewed' | 'rejected';

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  reviewedBy?: Types.ObjectId;

  @Prop({ type: Date })
  reviewedAt?: Date;

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}

export const FieldVisitSchema = SchemaFactory.createForClass(FieldVisit);

FieldVisitSchema.index({ marketerId: 1, visitedAt: -1 });
FieldVisitSchema.index({ facilityId: 1, visitedAt: -1 });
