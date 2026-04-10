import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type SystemSettingsDocument = SystemSettings & Document;

@Schema({ timestamps: true, collection: 'system_settings' })
export class SystemSettings {
  @Prop({ required: true, unique: true, default: 'default' })
  key!: string;

  @Prop({ default: 'Pharmacy POS' })
  companyName!: string;

  @Prop({ default: '' })
  companyAddress!: string;

  @Prop({ default: '' })
  companyPhone!: string;

  @Prop({ default: '' })
  companyEmail!: string;

  @Prop({ default: 'NGN' })
  currency!: string;

  @Prop({ default: 'Africa/Lagos' })
  timezone!: string;

  @Prop({ default: 'DD/MM/YYYY' })
  dateFormat!: string;

  @Prop({ default: 10 })
  lowStockThreshold!: number;

  @Prop({ default: 'Thank you for your business!' })
  receiptFooter!: string;

  @Prop({ default: false })
  enableLoyalty!: boolean;

  @Prop({ default: 1 })
  loyaltyPointsRate!: number;

  @Prop({ default: true })
  enableEmailNotifications!: boolean;

  @Prop({ default: false })
  enableSMSNotifications!: boolean;

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}

export const SystemSettingsSchema = SchemaFactory.createForClass(SystemSettings);
