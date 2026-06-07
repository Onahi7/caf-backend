import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type MarketerSaleDocument = MarketerSale & Document;

@Schema({ timestamps: true })
export class MarketerSale {
  @Prop({ type: Types.ObjectId, ref: 'Branch', required: true, index: true })
  branchId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  marketerId!: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'MarketerProductAssignment',
    required: true,
    index: true,
  })
  assignmentId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Product', required: true, index: true })
  productId!: Types.ObjectId;

  @Prop({ required: true, min: 1 })
  quantity!: number;

  @Prop({ required: true, min: 0 })
  unitPrice!: number;

  @Prop({ required: true, min: 0 })
  totalAmount!: number;

  @Prop()
  customerName?: string;

  @Prop()
  customerPhone?: string;

  @Prop({ type: Types.ObjectId, ref: 'Customer', index: true })
  customerId?: Types.ObjectId;

  @Prop()
  notes?: string;

  @Prop({ type: Date, default: () => new Date(), index: true })
  soldAt!: Date;

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}

export const MarketerSaleSchema = SchemaFactory.createForClass(MarketerSale);

MarketerSaleSchema.index({ marketerId: 1, soldAt: -1 });
MarketerSaleSchema.index({ branchId: 1, soldAt: -1 });
