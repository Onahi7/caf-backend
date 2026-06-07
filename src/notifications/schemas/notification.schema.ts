import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type NotificationDocument = Notification & Document;

export enum NotificationType {
  LOW_STOCK = 'low_stock',
  OUT_OF_STOCK = 'out_of_stock',
  EXPIRY_SOON = 'expiry_soon',
  BATCH_EXPIRED = 'batch_expired',
  CREDIT_OVERDUE = 'credit_overdue',
  PAYMENT_RECEIVED = 'payment_received',
  SHIFT_OPEN_LONG = 'shift_open_long',
  SHIFT_DISCREPANCY = 'shift_discrepancy',
  RECONCILIATION_VARIANCE = 'reconciliation_variance',
  TRANSFER_PENDING = 'transfer_pending',
  TRANSFER_APPROVED = 'transfer_approved',
  PURCHASE_ORDER_RECEIVED = 'purchase_order_received',
  PROMOTION_CREATED = 'promotion_created',
  CUSTOMER_ORDER_READY = 'customer_order_ready',
  SYSTEM = 'system',
}

export enum NotificationSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical',
}

@Schema({ timestamps: true, collection: 'notifications' })
export class Notification {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Branch', index: true })
  branchId?: Types.ObjectId;

  @Prop({ required: true, enum: NotificationType, index: true })
  type!: NotificationType;

  @Prop({ required: true })
  title!: string;

  @Prop({ required: true })
  message!: string;

  @Prop({ enum: NotificationSeverity, default: NotificationSeverity.INFO })
  severity!: NotificationSeverity;

  // Optional deep link to navigate to in the UI
  @Prop()
  link?: string;

  // Optional resource this notification refers to
  @Prop({ type: Types.ObjectId })
  resourceId?: Types.ObjectId;

  @Prop()
  resourceType?: string;

  @Prop({ type: Object })
  metadata?: Record<string, unknown>;

  @Prop({ default: false, index: true })
  read!: boolean;

  @Prop()
  readAt?: Date;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);

// Compound index for fetching user's recent notifications efficiently
NotificationSchema.index({ userId: 1, read: 1, createdAt: -1 });
NotificationSchema.index({ userId: 1, createdAt: -1 });
// Auto-expire read notifications after 30 days (sparse — only deletes read ones)
NotificationSchema.index(
  { readAt: 1 },
  { expireAfterSeconds: 30 * 24 * 60 * 60, partialFilterExpression: { read: true } },
);
