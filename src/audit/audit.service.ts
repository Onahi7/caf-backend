import { Injectable, Logger } from '@nestjs/common';
import { AuditRepository } from './audit.repository.js';
import {
  AuditAction,
  AuditResource,
  AuditLogDocument,
} from './schemas/audit-log.schema.js';
import { AuditFilterDto, CreateAuditLogDto } from './dto/audit-filter.dto.js';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly auditRepository: AuditRepository) {}

  /**
   * Create an audit log entry
   */
  async log(dto: CreateAuditLogDto): Promise<AuditLogDocument> {
    try {
      const auditLog = await this.auditRepository.create(dto);
      this.logger.debug(
        `Audit log created: ${dto.action} on ${dto.resource} by ${dto.username}`,
      );
      return auditLog;
    } catch (error) {
      this.logger.error(
        `Failed to create audit log: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }

  /**
   * Log a create action
   */
  async logCreate(
    userId: string,
    username: string,
    resource: AuditResource,
    resourceId: string,
    newData: Record<string, any>,
    branchId?: string,
    metadata?: Record<string, any>,
  ): Promise<AuditLogDocument> {
    return this.log({
      userId,
      username,
      action: AuditAction.CREATE,
      resource,
      resourceId,
      branchId,
      description: `Created ${resource}`,
      newData,
      metadata,
    });
  }

  /**
   * Log an update action
   */
  async logUpdate(
    userId: string,
    username: string,
    resource: AuditResource,
    resourceId: string,
    _oldData: Record<string, unknown>,
    newData: Record<string, unknown>,
    branchId?: string,
    metadata?: Record<string, unknown>,
  ): Promise<AuditLogDocument> {
    return this.log({
      userId,
      username,
      action: AuditAction.UPDATE,
      resource,
      resourceId,
      branchId,
      description: `Updated ${resource}`,
      previousData: _oldData,
      newData,
      metadata,
    });
  }

  /**
   * Log a delete action
   */
  async logDelete(
    userId: string,
    username: string,
    resource: AuditResource,
    resourceId: string,
    previousData: Record<string, unknown>,
    branchId?: string,
    metadata?: Record<string, unknown>,
  ): Promise<AuditLogDocument> {
    return this.log({
      userId,
      username,
      action: AuditAction.DELETE,
      resource,
      resourceId,
      branchId,
      description: `Deleted ${resource}`,
      previousData,
      metadata,
    });
  }

  /**
   * Log a login action
   */
  async logLogin(
    userId: string,
    username: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<AuditLogDocument> {
    return this.log({
      userId,
      username,
      action: AuditAction.LOGIN,
      resource: AuditResource.USER,
      resourceId: userId,
      description: `User logged in`,
      ipAddress,
      userAgent,
    });
  }

  /**
   * Log a logout action
   */
  async logLogout(userId: string, username: string): Promise<AuditLogDocument> {
    return this.log({
      userId,
      username,
      action: AuditAction.LOGOUT,
      resource: AuditResource.USER,
      resourceId: userId,
      description: `User logged out`,
    });
  }

  /**
   * Get audit logs with filtering
   */
  async getLogs(filter: AuditFilterDto): Promise<{
    logs: AuditLogDocument[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    return this.auditRepository.findWithFilter(filter);
  }

  /**
   * Get audit log by ID
   */
  async getLogById(id: string): Promise<AuditLogDocument | null> {
    return this.auditRepository.findById(id);
  }

  /**
   * Get audit history for a specific resource
   */
  async getResourceHistory(
    resource: AuditResource,
    resourceId: string,
  ): Promise<AuditLogDocument[]> {
    return this.auditRepository.findByResourceId(resource, resourceId);
  }

  /**
   * Get user activity
   */
  async getUserActivity(
    userId: string,
    limit: number = 50,
  ): Promise<AuditLogDocument[]> {
    return this.auditRepository.findByUserId(userId, limit);
  }

  /**
   * Get activity summary
   */
  async getActivitySummary(
    branchId?: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<{ action: string; count: number }[]> {
    return this.auditRepository.getActivitySummary(
      branchId,
      startDate,
      endDate,
    );
  }
}
