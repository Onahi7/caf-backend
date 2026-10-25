import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type FieldZoneDocument = FieldZone & Document;

export enum FieldZoneCode {
  WEST = 'WEST',
  CENTRAL = 'CENTRAL',
  EAST = 'EAST',
}

@Schema({ timestamps: true })
export class FieldZone {
  @Prop({ required: true, unique: true, enum: Object.values(FieldZoneCode), index: true })
  code!: FieldZoneCode;

  @Prop({ required: true })
  name!: string;

  @Prop({ required: true, default: 'Freetown' })
  city!: string;

  @Prop({ type: [String], default: [] })
  neighbourhoods!: string[];

  @Prop({ type: [String], default: [] })
  priorityFacilities!: string[];

  @Prop({ default: true, index: true })
  isActive!: boolean;

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}

export const FieldZoneSchema = SchemaFactory.createForClass(FieldZone);

FieldZoneSchema.index({ city: 1, isActive: 1 });

@Schema({ timestamps: true })
export class FieldVisitType {
  @Prop({ required: true, unique: true, index: true })
  code!: string;

  @Prop({ required: true })
  label!: string;

  @Prop({ required: true })
  exitRule!: string;

  @Prop({ required: true, default: 0 })
  sortOrder!: number;

  @Prop({ default: true, index: true })
  isActive!: boolean;

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}

export type FieldVisitTypeDocument = FieldVisitType & Document;
export const FieldVisitTypeSchema = SchemaFactory.createForClass(FieldVisitType);
