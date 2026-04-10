import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type StockMovementDocument = StockMovement & Document;

/**
 * Movement types supported by the system
 * Requirements: 3.2
 * Property 11: Movement type support
 */
export enum MovementType {
  PURCHASE = 'purchase',
  SALE = 'sale',
  TRANSFER = 'transfer',
  ADJUSTMENT = 'adjustment',
  RETURN = 'return',
  DISPOSAL = 'disposal',
}

/**
 * StockMovement Schema
 * Records all stock quantity changes with full audit trail
 * Requirements: 3.1, 3.2, 3.4
 * Properties: 10, 11, 12, 13
 */
@Schema({ timestamps: true })
export class StockMovement {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Branch', index: true })
  branchId!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Product', index: true })
  productId!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Batch', index: true })
  batchId!: Types.ObjectId;

  /**
   * Quantity change: positive for increase, negative for decrease
   */
  @Prop({ required: true })
  quantity!: number;

  @Prop({
    required: true,
    enum: MovementType,
    type: String,
  })
  movementType!: MovementType;

  @Prop({ required: true })
  reason!: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User', index: true })
  userId!: Types.ObjectId;

  /**
   * Reference to related entity (sale, transfer, or purchase order ID)
   */
  @Prop({ type: Types.ObjectId })
  referenceId?: Types.ObjectId;

  /**
   * Reference type to identify what the referenceId points to
   */
  @Prop()
  referenceType?: string;

  @Prop({ required: true, index: true, default: () => new Date() })
  timestamp!: Date;

  /**
   * Additional metadata for the movement
   */
  @Prop({ type: Object })
  metadata?: Record<string, any>;

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}

export const StockMovementSchema = SchemaFactory.createForClass(StockMovement);

// Compound indexes for efficient queries
StockMovementSchema.index({ branchId: 1, timestamp: -1 });
StockMovementSchema.index({ productId: 1, timestamp: -1 });
StockMovementSchema.index({ batchId: 1, timestamp: 1 });
StockMovementSchema.index({ branchId: 1, productId: 1, timestamp: -1 });

/**
 * Property 13: Stock movements are immutable
 * Note: Deletion prevention is enforced at the repository/service level
 * The repository does not expose delete methods for stock movements
 */
