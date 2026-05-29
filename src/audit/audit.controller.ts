import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { UserRole } from '../users/schemas/user.schema.js';
import { AuditService } from './audit.service.js';
import { AuditFilterDto } from './dto/audit-filter.dto.js';
import {
  AuditAction,
  AuditResource,
} from './schemas/audit-log.schema.js';

/**
 * Audit Controller
 * Handles audit trail and activity logging endpoints
 */
@ApiTags('Audit')
@Controller('audit')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  private mapLegacyActivityToAction(activity?: string): AuditAction | undefined {
    switch (activity) {
      case 'login':
        return AuditAction.LOGIN;
      case 'logout':
        return AuditAction.LOGOUT;
      case 'create':
        return AuditAction.CREATE;
      case 'update':
        return AuditAction.UPDATE;
      case 'delete':
        return AuditAction.DELETE;
      default:
        return undefined;
    }
  }

  private mapActionToLegacyActivity(
    action?: AuditAction,
    resource?: AuditResource,
  ): string {
    if (action === AuditAction.LOGIN) {
      return 'login';
    }

    if (action === AuditAction.LOGOUT) {
      return 'logout';
    }

    if (resource === AuditResource.SALE) {
      return 'sale';
    }

    if (resource === AuditResource.SHIFT) {
      return 'shift';
    }

    return action || 'view';
  }

  /**
   * GET /audit/logs
   * Get audit trail logs with filtering and pagination
   */
  @Get('logs')
  @Roles(UserRole.SUPER_ADMIN, UserRole.AUDITOR)
  async getLogs(@Query() filter: AuditFilterDto) {
    const result = await this.auditService.getLogs(filter);
    return {
      success: true,
      data: result.logs,
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
    };
  }

  /**
   * GET /audit/user-activity
   * Legacy-compatible user activity feed used by admin pages
   */
  @Get('user-activity')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.AUDITOR)
  async getUserActivityLegacy(
    @Query('userId') userId?: string,
    @Query('activity') activity?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('branchId') branchId?: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '100',
  ) {
    const result = await this.auditService.getLogs({
      userId: userId && userId !== 'all' ? userId : undefined,
      action: this.mapLegacyActivityToAction(activity),
      branchId,
      startDate: from,
      endDate: to,
      page,
      limit,
    });

    return result.logs.map((log: any) => ({
      _id: log._id?.toString() || '',
      userId: log.userId?._id?.toString() || log.userId?.toString() || '',
      userName: log.username || log.userId?.username || 'Unknown',
      userRole: log.userId?.role || 'unknown',
      activity: this.mapActionToLegacyActivity(log.action, log.resource),
      description: log.description || '',
      branchId: log.branchId?._id?.toString() || log.branchId?.toString(),
      branchName: log.branchId?.name,
      ipAddress: log.ipAddress,
      timestamp: log.createdAt,
    }));
  }

  /**
   * GET /audit/logs/:id
   * Get a specific audit log entry
   */
  @Get('logs/:id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.AUDITOR)
  async getLogById(@Param('id') id: string) {
    const log = await this.auditService.getLogById(id);
    return {
      success: true,
      data: log,
    };
  }

  /**
   * GET /audit/resource/:resource/:resourceId
   * Get audit history for a specific resource
   */
  @Get('resource/:resource/:resourceId')
  @Roles(UserRole.SUPER_ADMIN, UserRole.AUDITOR, UserRole.BRANCH_MANAGER)
  async getResourceHistory(
    @Param('resource') resource: AuditResource,
    @Param('resourceId') resourceId: string,
  ) {
    const logs = await this.auditService.getResourceHistory(
      resource,
      resourceId,
    );
    return {
      success: true,
      data: logs,
      count: logs.length,
    };
  }

  /**
   * GET /audit/user/:userId
   * Get activity for a specific user
   */
  @Get('user/:userId')
  @Roles(UserRole.SUPER_ADMIN, UserRole.AUDITOR)
  async getUserActivity(
    @Param('userId') userId: string,
    @Query('limit') limit?: string,
  ) {
    const logs = await this.auditService.getUserActivity(
      userId,
      limit ? parseInt(limit, 10) : 50,
    );
    return {
      success: true,
      data: logs,
      count: logs.length,
    };
  }

  /**
   * GET /audit/summary
   * Get activity summary statistics
   */
  @Get('summary')
  @Roles(UserRole.SUPER_ADMIN, UserRole.AUDITOR)
  async getActivitySummary(
    @Query('branchId') branchId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const summary = await this.auditService.getActivitySummary(
      branchId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
    return {
      success: true,
      data: summary,
    };
  }
}
