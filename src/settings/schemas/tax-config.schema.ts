import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type TaxConfigDocument = TaxConfig & Document;

export enum TaxType {
  PERCENTAGE = 'percentage',
  FIXED = 'fixed',
}

@Schema({ timestamps: true, collection: 'tax_configs' })
export class TaxConfig {
  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ required: true, min: 0 })
  rate!: number;

  @Prop({ required: true, enum: TaxType, default: TaxType.PERCENTAGE })
  type!: TaxType;

  @Prop({ type: [String], default: [] })
  applicableCategories!: string[];

  @Prop({ default: true })
  isActive!: boolean;

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}

export const TaxConfigSchema = SchemaFactory.createForClass(TaxConfig);
