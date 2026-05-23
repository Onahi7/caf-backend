import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CustomerOrderDocument = CustomerOrder & Document;

export enum CustomerOrderStatus {
  RECEIVED = 'received',
  REVIEWED = 'reviewed',
  QUOTED = 'quoted',
  CANCELLED = 'cancelled',
}

export enum ItemMatchStatus {
  MATCHED = 'matched',
  UNMATCHED = 'unmatched',
  NEW_PRODUCT_ADDED = 'new_product_added',
}

@Schema()
export class CustomerOrderItem {
  @Prop({ required: true })
  extractedName!: string;

  @Prop({ required: true })
  extractedQuantity!: number;

  @Prop()
  extractedUnitPrice?: number;

  @Prop({ type: Types.ObjectId, ref: 'Product' })
  matchedProductId?: Types.ObjectId;

  @Prop()
  matchConfidence?: number;

  @Prop({ required: true, enum: ItemMatchStatus, default: ItemMatchStatus.UNMATCHED })
  status!: ItemMatchStatus;
}

export const CustomerOrderItemSchema = SchemaFactory.createForClass(CustomerOrderItem);

@Schema()
export class SourceFileInfo {
  @Prop({ required: true })
  originalName!: string;

  @Prop({ required: true })
  mimeType!: string;

  @Prop({ required: true })
  url!: string;

  @Prop()
  publicId?: string;
}

export const SourceFileInfoSchema = SchemaFactory.createForClass(SourceFileInfo);

@Schema({ timestamps: true })
export class CustomerOrder {
  @Prop({ required: true, unique: true, index: true })
  orderNumber!: string;

  @Prop({ type: Types.ObjectId, ref: 'Customer' })
  customerId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Branch', required: true, index: true })
  branchId!: Types.ObjectId;

  @Prop({ type: SourceFileInfoSchema })
  sourceFile?: SourceFileInfo;

  @Prop()
  rawExtractedText?: string;

  @Prop({ type: [CustomerOrderItemSchema], default: [] })
  items!: CustomerOrderItem[];

  @Prop({ type: [{ type: Object }], default: [] })
  unmatchedItems!: Array<{ name: string; quantity: number }>;

  @Prop({
    required: true,
    enum: CustomerOrderStatus,
    default: CustomerOrderStatus.RECEIVED,
  })
  status!: CustomerOrderStatus;

  @Prop()
  notes?: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  createdBy!: Types.ObjectId;

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}

export const CustomerOrderSchema = SchemaFactory.createForClass(CustomerOrder);
CustomerOrderSchema.index({ branchId: 1, createdAt: -1 });
CustomerOrderSchema.index({ status: 1, branchId: 1 });
