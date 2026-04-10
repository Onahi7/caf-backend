import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ProductDocument = Product & Document;

@Schema({ timestamps: true })
export class Product {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Branch', index: true })
  branchId!: Types.ObjectId;

  @Prop({ required: true, index: true })
  name!: string;

  @Prop({ required: true, index: true })
  sku!: string;

  @Prop({ required: true, index: true })
  barcode!: string;

  @Prop({ required: true, index: true })
  category!: string;

  @Prop({ required: true })
  brand!: string;

  @Prop({ required: true })
  unit!: string;

  @Prop({ required: true, default: 0 })
  reorderLevel!: number;

  @Prop({ default: 0 })
  maxStockLevel!: number;

  @Prop({ required: true, default: 0 })
  basePrice!: number;

  @Prop({ required: true, default: 0 })
  costPrice!: number;

  @Prop({ default: 0 })
  suggestedRetailPrice!: number;

  @Prop({ default: 0 })
  markupPercentage!: number;

  @Prop({ default: false })
  requiresPrescription!: boolean;

  @Prop({ default: false })
  isControlled!: boolean;

  @Prop({ default: true })
  isActive!: boolean;

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}

export const ProductSchema = SchemaFactory.createForClass(Product);

// Compound unique indexes - SKU and barcode must be unique within a branch
ProductSchema.index({ branchId: 1, sku: 1 }, { unique: true });
ProductSchema.index({ branchId: 1, barcode: 1 }, { unique: true });
