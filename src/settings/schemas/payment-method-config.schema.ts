import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PaymentMethodConfigDocument = PaymentMethodConfig & Document;

export enum PaymentMethodConfigType {
  CASH = 'cash',
  CARD = 'card',
  MOBILE_MONEY = 'mobile_money',
  BANK_TRANSFER = 'bank_transfer',
  OTHER = 'other',
}

@Schema({ timestamps: true, collection: 'payment_method_configs' })
export class PaymentMethodConfig {
  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ required: true, enum: PaymentMethodConfigType })
  type!: PaymentMethodConfigType;

  @Prop({ default: true })
  isActive!: boolean;

  @Prop({ min: 0, max: 100 })
  processingFee?: number;

  @Prop()
  accountDetails?: string;

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}

export const PaymentMethodConfigSchema =
  SchemaFactory.createForClass(PaymentMethodConfig);
