import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ShiftDocument = Shift & Document;

export enum ShiftStatus {
  OPEN = 'open',
  CLOSED = 'closed',
}

@Schema({ timestamps: true })
export class Shift {
  @Prop({ type: Types.ObjectId, ref: 'Branch', required: true, index: true })
  branchId!: Types.ObjectId;

  @Prop({ required: true })
  terminalId!: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  cashierId!: Types.ObjectId;

  @Prop({ required: true })
  openingCash!: number;

  @Prop()
  closingCash?: number;

  @Prop()
  expectedCash?: number;

  @Prop()
  variance?: number;

  @Prop({
    required: true,
    enum: Object.values(ShiftStatus),
    default: ShiftStatus.OPEN,
  })
  status!: ShiftStatus;

  @Prop({ required: true })
  openedAt!: Date;

  @Prop()
  closedAt?: Date;

  @Prop()
  notes?: string;

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}

export const ShiftSchema = SchemaFactory.createForClass(Shift);

// Compound index for finding open shifts by cashier at a branch
ShiftSchema.index({ branchId: 1, cashierId: 1, status: 1 });
