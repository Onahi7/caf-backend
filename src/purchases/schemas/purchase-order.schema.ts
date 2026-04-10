import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PurchaseOrderDocument = PurchaseOrder & Document;

export enum PurchaseOrderStatus {
  PENDING = 'pending',
  PARTIALLY_RECEIVED = 'partially_received',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

@Schema()
export class PurchaseOrderItem {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Product' })
  productId!: Types.ObjectId;

  @Prop({ required: true })
  quantity!: number;

  @Prop({ required: true })
  unitPrice!: number;

  @Prop({ default: 0 })
  receivedQuantity!: number;
}

export const PurchaseOrderItemSchema =
  SchemaFactory.createForClass(PurchaseOrderItem);

@Schema({ timestamps: true })
export class PurchaseOrder {
  @Prop({ required: true, unique: true, index: true })
  orderNumber!: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Supplier', index: true })
  supplierId!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Branch', index: true })
  branchId!: Types.ObjectId;

  @Prop({ required: true, type: [PurchaseOrderItemSchema] })
  items!: PurchaseOrderItem[];

  @Prop({ required: true })
  totalAmount!: number;

  @Prop({
    required: true,
    enum: PurchaseOrderStatus,
    default: PurchaseOrderStatus.PENDING,
    index: true,
  })
  status!: PurchaseOrderStatus;

  @Prop({ required: true })
  expectedDeliveryDate!: Date;

  @Prop()
  receivedAt?: Date;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  createdBy!: Types.ObjectId;

  @Prop()
  notes?: string;

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}

export const PurchaseOrderSchema = SchemaFactory.createForClass(PurchaseOrder);
