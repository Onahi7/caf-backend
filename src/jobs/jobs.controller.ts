import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { UserRole } from '../users/schemas/user.schema.js';
import { JobsService } from './jobs.service.js';

@ApiTags('Jobs')
@Controller('jobs')
@UseGuards(JwtAuthGuard, RolesGuard)
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.AUDITOR)
  async findAll(
    @Query('status') status?: string,
    @Query('type') type?: string,
  ): Promise<
    Array<{
      _id: string;
      name: string;
      type: string;
      status: 'pending' | 'active' | 'completed' | 'failed' | 'delayed';
      data: Record<string, unknown>;
      progress?: number;
      error?: string;
      attempts: number;
      maxAttempts: number;
      createdAt: string;
      startedAt?: string;
      completedAt?: string;
      failedAt?: string;
    }>
  > {
    return this.jobsService.getJobs(status, type);
  }

  @Get('stats')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.AUDITOR)
  async getStats(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  }> {
    const stats = await this.jobsService.getQueueStats();

    return {
      waiting: (stats.expiryAlerts.waiting || 0) + (stats.lowStockAlerts.waiting || 0),
      active: (stats.expiryAlerts.active || 0) + (stats.lowStockAlerts.active || 0),
      completed:
        (stats.expiryAlerts.completed || 0) +
        (stats.lowStockAlerts.completed || 0),
      failed: (stats.expiryAlerts.failed || 0) + (stats.lowStockAlerts.failed || 0),
      delayed: 0,
    };
  }
}
