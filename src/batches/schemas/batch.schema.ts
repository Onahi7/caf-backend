import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type BatchDocument = Batch & Document;

@Schema({ timestamps: true })
export class Batch {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Product', index: true })
  productId!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Branch', index: true })
  branchId!: Types.ObjectId;

  @Prop({ required: true, index: true })
  lotNumber!: string;

  @Prop({ required: true, index: true })
  expiryDate!: Date;

  @Prop({
    required: true,
    default: 0,
    validate: {
      validator: (v: number) => v >= 0,
      message: 'quantityAvailable cannot be negative',
    },
  })
  quantityAvailable!: number;

  @Prop({ required: true })
  quantityInitial!: number;

  @Prop({ required: true })
  purchasePrice!: number;

  @Prop({ required: true })
  sellingPrice!: number;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Supplier' })
  supplierId!: Types.ObjectId;

  @Prop({ default: false })
  isExpired!: boolean;

  @Prop({ default: false })
  isDepleted!: boolean;

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}

export const BatchSchema = SchemaFactory.createForClass(Batch);

// Compound index for FEFO queries: branchId + productId + expiryDate
BatchSchema.index({ branchId: 1, productId: 1, expiryDate: 1 });

// Unique lot number per product per branch - prevents duplicate batches
BatchSchema.index(
  { branchId: 1, productId: 1, lotNumber: 1 },
  { unique: true },
);
