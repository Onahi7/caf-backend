import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Notification,
  NotificationDocument,
  NotificationType,
  NotificationSeverity,
} from './schemas/notification.schema.js';
import { EventsService } from '../websocket/events.service.js';

export interface CreateNotificationInput {
  userId: string | Types.ObjectId;
  branchId?: string | Types.ObjectId;
  type: NotificationType;
  title: string;
  message: string;
  severity?: NotificationSeverity;
  link?: string;
  resourceId?: string | Types.ObjectId;
  resourceType?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class NotificationsService {
  constructor(
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<NotificationDocument>,
    private readonly eventsService: EventsService,
  ) {}

  /**
   * Create a notification for a user. Emits a real-time event.
   * If a similar unread notification already exists for the same user+resource,
   * it will be updated rather than duplicated.
   */
  async create(input: CreateNotificationInput): Promise<NotificationDocument> {
    const userId = typeof input.userId === 'string' ? new Types.ObjectId(input.userId) : input.userId;
    const branchId = input.branchId
      ? typeof input.branchId === 'string'
        ? new Types.ObjectId(input.branchId)
        : input.branchId
      : undefined;
    const resourceId = input.resourceId
      ? typeof input.resourceId === 'string'
        ? new Types.ObjectId(input.resourceId)
        : input.resourceId
      : undefined;

    let doc: NotificationDocument | null = null;
    if (resourceId) {
      doc = await this.notificationModel.findOneAndUpdate(
        {
          userId,
          resourceId,
          read: false,
        },
        {
          $set: {
            type: input.type,
            title: input.title,
            message: input.message,
            severity: input.severity ?? NotificationSeverity.INFO,
            link: input.link,
            resourceType: input.resourceType,
            metadata: input.metadata,
          },
          $setOnInsert: {
            branchId,
            read: false,
          },
        },
        { upsert: true, new: true },
      );
    } else {
      doc = await this.notificationModel.create({
        userId,
        branchId,
        type: input.type,
        title: input.title,
        message: input.message,
        severity: input.severity ?? NotificationSeverity.INFO,
        link: input.link,
        resourceId,
        resourceType: input.resourceType,
        metadata: input.metadata,
      });
    }

    if (!doc) {
      throw new Error('Failed to create or update notification');
    }

    this.eventsService.emitNotificationCreated({
      notificationId: doc._id.toString(),
      userId: userId.toString(),
      branchId: branchId?.toString(),
      type: input.type,
      title: input.title,
      message: input.message,
      severity: doc.severity,
      link: doc.link,
      createdAt: doc.get('createdAt') as Date,
    });

    return doc;
  }

  /**
   * List notifications for a user (paginated, newest first)
   */
  async listForUser(
    userId: string | Types.ObjectId,
    options: { limit?: number; unreadOnly?: boolean } = {},
  ): Promise<NotificationDocument[]> {
    const uid = typeof userId === 'string' ? new Types.ObjectId(userId) : userId;
    const filter: Record<string, unknown> = { userId: uid };
    if (options.unreadOnly) filter.read = false;

    return this.notificationModel
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(Math.min(options.limit ?? 50, 200))
      .lean<NotificationDocument[]>()
      .exec();
  }

  async countUnread(userId: string | Types.ObjectId): Promise<number> {
    const uid = typeof userId === 'string' ? new Types.ObjectId(userId) : userId;
    return this.notificationModel.countDocuments({ userId: uid, read: false });
  }

  async markRead(
    id: string,
    userId: string | Types.ObjectId,
  ): Promise<NotificationDocument> {
    const uid = typeof userId === 'string' ? new Types.ObjectId(userId) : userId;
    const doc = await this.notificationModel.findOneAndUpdate(
      { _id: new Types.ObjectId(id), userId: uid },
      { $set: { read: true, readAt: new Date() } },
      { new: true },
    );
    if (!doc) throw new NotFoundException('Notification not found');
    return doc;
  }

  async markAllRead(userId: string | Types.ObjectId): Promise<number> {
    const uid = typeof userId === 'string' ? new Types.ObjectId(userId) : userId;
    const res = await this.notificationModel.updateMany(
      { userId: uid, read: false },
      { $set: { read: true, readAt: new Date() } },
    );
    return res.modifiedCount ?? 0;
  }

  async remove(id: string, userId: string | Types.ObjectId): Promise<void> {
    const uid = typeof userId === 'string' ? new Types.ObjectId(userId) : userId;
    const res = await this.notificationModel.deleteOne({
      _id: new Types.ObjectId(id),
      userId: uid,
    });
    if (res.deletedCount === 0) {
      throw new NotFoundException('Notification not found');
    }
  }
}
