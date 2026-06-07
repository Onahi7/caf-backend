import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SavedReportDocument = SavedReport & Document;

export enum ReportSchedule {
  NONE = 'none',
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
}

@Schema({ timestamps: true, collection: 'saved_reports' })
export class SavedReport {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ required: true })
  name!: string;

  @Prop()
  description?: string;

  @Prop({ required: true, index: true })
  reportKey!: string;

  @Prop({ required: true })
  route!: string;

  @Prop({ type: Object, required: true })
  params!: Record<string, unknown>;

  @Prop({ enum: ReportSchedule, default: ReportSchedule.NONE })
  schedule!: ReportSchedule;

  @Prop({ type: [String], default: [] })
  recipients!: string[];

  @Prop()
  lastRunAt?: Date;
}

export const SavedReportSchema = SchemaFactory.createForClass(SavedReport);
SavedReportSchema.index({ userId: 1, reportKey: 1 });
SavedReportSchema.index({ schedule: 1, lastRunAt: 1 });
