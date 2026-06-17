import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CycleCountDocument = CycleCount & Document;

export enum CycleCountStatus {
  DRAFT = 'draft',       // created, counting in progress
  SUBMITTED = 'submitted', // all lines counted, awaiting review
  APPROVED = 'approved',  // manager approved - adjustments applied
  CANCELLED = 'cancelled',
}

export interface CycleCountLine {
  productId: Types.ObjectId;
  /**
   * Legacy field name kept for API compatibility. For product-level counts,
   * this stores the product id and should be treated as the line id.
   */
  batchId: Types.ObjectId;
  lotNumber: string;
  systemQuantity: number;   // snapshot at time of count creation
  countedQuantity: number | null; // null = not yet counted
  variance: number | null;  // countedQuantity - systemQuantity
}

@Schema({ timestamps: true })
export class CycleCount {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Branch', index: true })
  branchId!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  createdBy!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  approvedBy?: Types.ObjectId;

  @Prop({
    required: true,
    enum: CycleCountStatus,
    default: CycleCountStatus.DRAFT,
    index: true,
  })
  status!: CycleCountStatus;

  @Prop({ type: String })
  notes?: string;

  @Prop({
    type: [
      {
        productId: { type: Types.ObjectId, ref: 'Product', required: true },
        batchId: { type: Types.ObjectId, ref: 'Product', required: true },
        lotNumber: { type: String, default: 'Product total' },
        systemQuantity: { type: Number, required: true },
        countedQuantity: { type: Number, default: null },
        variance: { type: Number, default: null },
      },
    ],
    default: [],
  })
  lines!: CycleCountLine[];

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}

export const CycleCountSchema = SchemaFactory.createForClass(CycleCount);
CycleCountSchema.index({ branchId: 1, status: 1 });
