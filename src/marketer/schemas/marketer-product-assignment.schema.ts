import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type MarketerProductAssignmentDocument = MarketerProductAssignment & Document;

export enum MarketerAssignmentStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
}

@Schema({ _id: false })
export class MarketerBatchAllocation {
  @Prop({ type: Types.ObjectId, ref: 'Batch', required: true })
  batchId!: Types.ObjectId;

  @Prop({ required: true, min: 0 })
  quantity!: number;

  @Prop({ required: true, min: 0 })
  remainingQuantity!: number;
}

const MarketerBatchAllocationSchema = SchemaFactory.createForClass(MarketerBatchAllocation);

@Schema({ timestamps: true })
export class MarketerProductAssignment {
  @Prop({ type: Types.ObjectId, ref: 'Branch', required: true, index: true })
  branchId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  marketerId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Product', required: true, index: true })
  productId!: Types.ObjectId;

  @Prop({ required: true, min: 1 })
  assignedQuantity!: number;

  @Prop({ required: true, min: 0 })
  remainingQuantity!: number;

  @Prop({ type: [MarketerBatchAllocationSchema], default: [] })
  batchAllocations!: MarketerBatchAllocation[];

  @Prop({ required: true, min: 0 })
  assignedUnitPrice!: number;

  @Prop({
    type: String,
    enum: Object.values(MarketerAssignmentStatus),
    default: MarketerAssignmentStatus.PENDING,
    index: true,
  })
  status!: MarketerAssignmentStatus;

  @Prop({ default: true })
  isActive!: boolean;

  @Prop({ type: Date })
  reviewedAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  reviewedBy?: Types.ObjectId;

  @Prop()
  notes?: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  assignedBy!: Types.ObjectId;

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}

export const MarketerProductAssignmentSchema =
  SchemaFactory.createForClass(MarketerProductAssignment);

MarketerProductAssignmentSchema.index(
  { branchId: 1, marketerId: 1, productId: 1, isActive: 1 },
  { unique: true, partialFilterExpression: { isActive: true } },
);
