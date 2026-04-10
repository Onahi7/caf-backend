import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type BranchDocument = Branch & Document;

export interface BranchConfig {
  reorderThreshold: number;
  expiryAlertDays: number[];
  allowNegativeStock: boolean;
}

@Schema({ timestamps: true })
export class Branch {
  @Prop({ required: true })
  name!: string;

  @Prop({ required: true, unique: true, index: true })
  code!: string;

  @Prop({ required: true })
  address!: string;

  @Prop({ required: true })
  phone!: string;

  @Prop({ required: true })
  email!: string;

  @Prop({ default: false })
  isHeadquarters!: boolean;

  @Prop({
    type: {
      reorderThreshold: { type: Number, default: 10 },
      expiryAlertDays: { type: [Number], default: [30, 60, 90] },
      allowNegativeStock: { type: Boolean, default: false },
    },
    default: {
      reorderThreshold: 10,
      expiryAlertDays: [30, 60, 90],
      allowNegativeStock: false,
    },
  })
  config!: BranchConfig;

  @Prop({ default: true })
  isActive!: boolean;

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}

export const BranchSchema = SchemaFactory.createForClass(Branch);
