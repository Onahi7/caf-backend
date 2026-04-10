import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuditLog, AuditLogDocument } from './schemas/audit-log.schema.js';
import { AuditFilterDto, CreateAuditLogDto } from './dto/audit-filter.dto.js';

@Injectable()
export class AuditRepository {
  constructor(
    @InjectModel(AuditLog.name) private auditLogModel: Model<AuditLogDocument>,
  ) {}

  async create(dto: CreateAuditLogDto): Promise<AuditLogDocument> {
    const auditLog = new this.auditLogModel({
      ...dto,
      userId: new Types.ObjectId(dto.userId),
      resourceId: dto.resourceId
        ? new Types.ObjectId(dto.resourceId)
        : undefined,
      branchId: dto.branchId ? new Types.ObjectId(dto.branchId) : undefined,
    });
    return auditLog.save();
  }

  async findWithFilter(filter: AuditFilterDto): Promise<{
    logs: AuditLogDocument[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const page = parseInt(filter.page || '1', 10);
    const limit = parseInt(filter.limit || '50', 10);
    const skip = (page - 1) * limit;

    const query: Record<string, unknown> = {};

    if (filter.userId) {
      query.userId = new Types.ObjectId(filter.userId);
    }

    if (filter.action) {
      query.action = filter.action;
    }

    if (filter.resource) {
      query.resource = filter.resource;
    }

    if (filter.resourceId) {
      query.resourceId = new Types.ObjectId(filter.resourceId);
    }

    if (filter.branchId) {
      query.branchId = new Types.ObjectId(filter.branchId);
    }

    if (filter.startDate || filter.endDate) {
      query.createdAt = {};
      if (filter.startDate) {
        (query.createdAt as Record<string, unknown>).$gte = new Date(filter.startDate);
      }
      if (filter.endDate) {
        (query.createdAt as Record<string, unknown>).$lte = new Date(filter.endDate);
      }
    }

    const [logs, total] = await Promise.all([
      this.auditLogModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('userId', 'username firstName lastName')
        .populate('branchId', 'name code')
        .exec(),
      this.auditLogModel.countDocuments(query).exec(),
    ]);

    return {
      logs,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findById(id: string): Promise<AuditLogDocument | null> {
    return this.auditLogModel
      .findById(id)
      .populate('userId', 'username firstName lastName')
      .populate('branchId', 'name code')
      .exec();
  }

  async findByResourceId(
    resource: string,
    resourceId: string,
  ): Promise<AuditLogDocument[]> {
    return this.auditLogModel
      .find({
        resource,
        resourceId: new Types.ObjectId(resourceId),
      })
      .sort({ createdAt: -1 })
      .populate('userId', 'username firstName lastName')
      .exec();
  }

  async findByUserId(
    userId: string,
    limit: number = 50,
  ): Promise<AuditLogDocument[]> {
    return this.auditLogModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();
  }

  async getActivitySummary(
    branchId?: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<{ action: string; count: number }[]> {
    const match: Record<string, unknown> = {};

    if (branchId) {
      match.branchId = new Types.ObjectId(branchId);
    }

    if (startDate || endDate) {
      match.createdAt = {};
      if (startDate) (match.createdAt as Record<string, unknown>).$gte = startDate;
      if (endDate) (match.createdAt as Record<string, unknown>).$lte = endDate;
    }

    return this.auditLogModel.aggregate([
      { $match: match },
      { $group: { _id: '$action', count: { $sum: 1 } } },
      { $project: { action: '$_id', count: 1, _id: 0 } },
      { $sort: { count: -1 } },
    ]);
  }
}
