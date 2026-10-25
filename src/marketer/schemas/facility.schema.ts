import { Schema as MongooseSchema } from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { FieldZoneCode } from './field-zone.schema.js';

export type FacilityDocument = Facility & Document;

export enum FacilityType {
  HOSPITAL = 'Hospital',
  CHC = 'CHC',
  CLINIC = 'Clinic',
  PHARMACY = 'Pharmacy',
  OTHER = 'Other',
}

export enum FacilityGrade {
  A = 'A',
  B = 'B',
  C = 'C',
  D = 'D',
}

export enum HarborStatus {
  NONE = 'none',
  PAD_LEFT = 'pad_left',
  ACTIVE = 'active',
}

export enum FacilityStatus {
  PROSPECT = 'prospect',
  ACTIVE = 'active',
  DORMANT = 'dormant',
  CLOSED = 'closed',
}

@Schema({ _id: false })
export class FacilityLocation {
  @Prop()
  latitude?: number;

  @Prop()
  longitude?: number;

  @Prop()
  landmark?: string;
}

export const FacilityLocationSchema = SchemaFactory.createForClass(FacilityLocation);

@Schema({ timestamps: true })
export class Facility {
  @Prop({ required: true, index: true })
  name!: string;

  @Prop({ required: true, enum: Object.values(FacilityType), type: String })
  type!: FacilityType;

  @Prop({ required: true, enum: Object.values(FieldZoneCode), type: String, index: true })
  zoneCode!: FieldZoneCode;

  @Prop({ required: true, index: true })
  neighbourhood!: string;

  @Prop({ type: FacilityLocationSchema })
  location?: FacilityLocation;

  @Prop()
  inChargeName?: string;

  @Prop()
  inChargePhone?: string;

  @Prop()
  buyerName?: string;

  @Prop()
  buyerPhone?: string;

  @Prop({ enum: Object.values(FacilityGrade), type: String })
  grade?: FacilityGrade;

  @Prop()
  gradeReason?: string;

  @Prop()
  surfaceDisinfectant?: string;

  @Prop()
  testsRunVsReferred?: string;

  @Prop({ enum: Object.values(HarborStatus), type: String, default: HarborStatus.NONE })
  harborStatus!: HarborStatus;

  @Prop()
  bestVisitTime?: string;

  @Prop({ type: Date, index: true })
  lastVisitAt?: Date;

  @Prop({ type: Date, index: true })
  nextVisitAt?: Date;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Branch', required: true, index: true })
  branchId!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', index: true })
  assignedMarketerId?: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  createdBy!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  updatedBy?: Types.ObjectId;

  @Prop({ enum: Object.values(FacilityStatus), type: String, default: FacilityStatus.PROSPECT, index: true })
  status!: FacilityStatus;

  @Prop()
  notes?: string;

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}

export const FacilitySchema = SchemaFactory.createForClass(Facility);

FacilitySchema.index({ branchId: 1, zoneCode: 1, name: 1 });
FacilitySchema.index({ assignedMarketerId: 1, nextVisitAt: 1 });
