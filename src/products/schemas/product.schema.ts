import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ProductDocument = Product & Document;

/**
 * Pack size definition for unit conversion hierarchy
 * Example for Paracetamol 500mg:
 *   - { name: "Box", unit: "box", quantityPerPack: 100, sellingPrice: 5000, barcode: "BOX123" }
 *   - { name: "Strip", unit: "strip", quantityPerPack: 10, sellingPrice: 600, barcode: "STR123" }
 *   - { name: "Tablet", unit: "tablet", quantityPerPack: 1, sellingPrice: 70, barcode: "TAB123" }
 *
 * Stock is tracked in base units (smallest unit, e.g., tablets).
 * When selling 2 boxes, 200 tablets are deducted from stock.
 */
@Schema({ _id: false })
export class PackSize {
  @Prop({ required: true })
  name!: string; // Display name: "Box", "Strip", "Tablet"

  @Prop({ required: true })
  unit!: string; // Unit identifier: "box", "strip", "tablet"

  @Prop({ required: true })
  quantityPerPack!: number; // How many base units in this pack (e.g., 100 for box)

  @Prop({ required: true })
  sellingPrice!: number; // Price for this pack size

  @Prop()
  barcode?: string; // Optional barcode specific to this pack size
}

export const PackSizeSchema = SchemaFactory.createForClass(PackSize);

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
  unit!: string; // Base unit: "tablet", "capsule", "ml", "g", "piece"

  @Prop({ required: true, default: 0 })
  reorderLevel!: number;

  @Prop({ default: 0 })
  maxStockLevel!: number;

  @Prop({ required: true, default: 0 })
  basePrice!: number; // Price per base unit

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

  /**
   * Pack sizes for unit conversion hierarchy.
   * Stock is always tracked in base units (unit field).
   * Each pack size defines how many base units it contains and its selling price.
   */
  @Prop({ type: [PackSizeSchema], default: [] })
  packSizes!: PackSize[];

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}

export const ProductSchema = SchemaFactory.createForClass(Product);

// Compound unique indexes - SKU and barcode must be unique within a branch
ProductSchema.index({ branchId: 1, sku: 1 }, { unique: true });
ProductSchema.index({ branchId: 1, barcode: 1 }, { unique: true });
