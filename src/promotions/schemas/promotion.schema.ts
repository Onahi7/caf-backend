import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum PromotionType {
  PERCENTAGE = 'percentage',
  FIXED_AMOUNT = 'fixed_amount',
  BUY_X_GET_Y = 'buy_x_get_y',
}

export enum PromotionScope {
  ENTIRE_TRANSACTION = 'entire_transaction',
  SPECIFIC_ITEM = 'specific_item',
  CATEGORY = 'category',
}

@Schema({ timestamps: true })
export class Promotion extends Document {
  @Prop({ required: true })
  name!: string;

  @Prop()
  description?: string;

  @Prop({ required: true, enum: PromotionType })
  type!: PromotionType;

  @Prop({ required: true, enum: PromotionScope })
  scope!: PromotionScope;

  @Prop({ required: true })
  value!: number; // percentage or fixed amount

  @Prop()
  minimumPurchase?: number;

  @Prop()
  maximumDiscount?: number;

  @Prop({ type: [Types.ObjectId], ref: 'Product' })
  applicableProducts?: Types.ObjectId[];

  @Prop({ type: [String] })
  applicableCategories?: string[];

  @Prop({ type: Types.ObjectId, ref: 'Branch' })
  branchId?: Types.ObjectId; // null means all branches

  @Prop({ required: true })
  startDate!: Date;

  @Prop({ required: true })
  endDate!: Date;

  @Prop({ default: true })
  isActive!: boolean;

  @Prop()
  usageLimit?: number;

  @Prop({ default: 0 })
  usageCount!: number;

  @Prop()
  code?: string; // optional promo code

  @Prop({ default: false })
  requiresCode!: boolean;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy!: Types.ObjectId;
}

export const PromotionSchema = SchemaFactory.createForClass(Promotion);

PromotionSchema.index({ isActive: 1, startDate: 1, endDate: 1 });
PromotionSchema.index({ code: 1 }, { sparse: true });
PromotionSchema.index({ branchId: 1 });
