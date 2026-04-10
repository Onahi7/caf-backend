import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type EmailLogDocument = EmailLog & Document;

export enum EmailStatus {
  PENDING = 'pending',
  SENT = 'sent',
  FAILED = 'failed',
}

@Schema({ timestamps: true, collection: 'email_logs' })
export class EmailLog {
  @Prop({ required: true })
  to!: string;

  @Prop({ required: true })
  subject!: string;

  @Prop()
  template?: string;

  @Prop({ required: true, enum: EmailStatus, default: EmailStatus.PENDING })
  status!: EmailStatus;

  @Prop()
  error?: string;

  @Prop()
  sentAt?: Date;

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}

export const EmailLogSchema = SchemaFactory.createForClass(EmailLog);
