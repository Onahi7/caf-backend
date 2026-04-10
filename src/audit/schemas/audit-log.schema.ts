import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AuditLogDocument = AuditLog & Document;

export enum AuditAction {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LOGIN = 'login',
  LOGOUT = 'logout',
  VIEW = 'view',
  EXPORT = 'export',
  APPROVE = 'approve',
  REJECT = 'reject',
}

export enum AuditResource {
  USER = 'user',
  PRODUCT = 'product',
  BATCH = 'batch',
  SALE = 'sale',
  TRANSFER = 'transfer',
  INVENTORY = 'inventory',
  SHIFT = 'shift',
  BRANCH = 'branch',
  CUSTOMER = 'customer',
  SUPPLIER = 'supplier',
  PURCHASE = 'purchase',
  REPORT = 'report',
  EXPENSE = 'expense',
  PROMOTION = 'promotion',
}

@Schema({ timestamps: true, collection: 'audit_logs' })
export class AuditLog {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId!: Types.ObjectId;

  @Prop({ required: true })
  username!: string;

  @Prop({ required: true, enum: AuditAction })
  action!: AuditAction;

  @Prop({ required: true, enum: AuditResource })
  resource!: AuditResource;

  @Prop({ type: Types.ObjectId })
  resourceId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Branch' })
  branchId?: Types.ObjectId;

  @Prop()
  description!: string;

  @Prop({ type: Object })
  previousData?: Record<string, unknown>;

  @Prop({ type: Object })
  newData?: Record<string, unknown>;

  @Prop({ type: Object })
  metadata?: Record<string, unknown>;

  @Prop()
  ipAddress?: string;

  @Prop()
  userAgent?: string;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);

// Indexes for efficient querying
AuditLogSchema.index({ userId: 1, createdAt: -1 });
AuditLogSchema.index({ action: 1, createdAt: -1 });
AuditLogSchema.index({ resource: 1, resourceId: 1 });
AuditLogSchema.index({ branchId: 1, createdAt: -1 });
AuditLogSchema.index({ createdAt: -1 });
