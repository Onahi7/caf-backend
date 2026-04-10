import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type TransferDocument = Transfer & Document;

/**
 * Transfer status enum
 * Requirements: 4.5
 * Property 18: Transfer approval workflow
 */
export enum TransferStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  COMPLETED = 'completed',
}

/**
 * Transfer type enum
 * Requirements: 4.3
 * Property 17: Transfer type support
 */
export enum TransferType {
  OUTLET_TO_OUTLET = 'outlet-to-outlet',
  HQ_TO_OUTLET = 'hq-to-outlet',
  OUTLET_TO_HQ = 'outlet-to-hq',
}

/**
 * Transfer Schema
 * Records inter-branch inventory transfers with approval workflow
 * Requirements: 4.1, 4.3, 4.5
 * Properties: 15, 16, 17, 18
 */
@Schema({ timestamps: true })
export class Transfer {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Branch', index: true })
  sourceBranchId!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Branch', index: true })
  destinationBranchId!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Product', index: true })
  productId!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Batch', index: true })
  batchId!: Types.ObjectId;

  @Prop({ required: true, min: 1 })
  quantity!: number;

  @Prop({ required: true })
  reason!: string;

  @Prop({
    required: true,
    enum: TransferStatus,
    type: String,
    default: TransferStatus.PENDING,
    index: true,
  })
  status!: TransferStatus;

  @Prop({
    required: true,
    enum: TransferType,
    type: String,
  })
  transferType!: TransferType;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  requestedBy!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  approvedBy?: Types.ObjectId;

  @Prop()
  completedAt?: Date;

  @Prop()
  notes?: string;

  @Prop()
  rejectionReason?: string;

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}

export const TransferSchema = SchemaFactory.createForClass(Transfer);

// Indexes for efficient queries
TransferSchema.index({ sourceBranchId: 1, status: 1 });
TransferSchema.index({ destinationBranchId: 1, status: 1 });
TransferSchema.index({ status: 1, createdAt: -1 });
TransferSchema.index({ sourceBranchId: 1, destinationBranchId: 1, status: 1 });
