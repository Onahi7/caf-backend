import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue, JobStatus } from 'bull';
import { Cron, CronExpression } from '@nestjs/schedule';

interface JobListItem {
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
}

/**
 * JobsService
 * Manages scheduled background jobs for alerts
 * Requirements: 12.5, 8.4
 */
@Injectable()
export class JobsService implements OnModuleInit {
  private readonly logger = new Logger(JobsService.name);
  private readonly redisEnabled: boolean;

  constructor(
    @Optional()
    @InjectQueue('expiry-alerts')
    private readonly expiryQueue?: Queue,
    @Optional()
    @InjectQueue('low-stock-alerts')
    private readonly lowStockQueue?: Queue,
  ) {
    this.redisEnabled = !!(this.expiryQueue && this.lowStockQueue);
  }

  async onModuleInit() {
    if (!this.redisEnabled) {
      this.logger.warn(
        'JobsService initialized without Redis. Background jobs are disabled.',
      );
      return;
    }

    this.logger.log('JobsService initialized with Bull Queue');
    // Clean up any stale jobs on startup
    await this.cleanupStaleJobs();
  }

  private async cleanupStaleJobs() {
    if (!this.redisEnabled || !this.expiryQueue || !this.lowStockQueue) return;

    try {
      await this.expiryQueue.clean(24 * 60 * 60 * 1000, 'completed');
      await this.expiryQueue.clean(24 * 60 * 60 * 1000, 'failed');
      await this.lowStockQueue.clean(24 * 60 * 60 * 1000, 'completed');
      await this.lowStockQueue.clean(24 * 60 * 60 * 1000, 'failed');
      this.logger.log('Cleaned up stale jobs');
    } catch (error) {
      this.logger.warn('Failed to clean up stale jobs', error);
    }
  }

  /**
   * Schedule expiry alert check - runs daily at 6 AM
   * Requirements: 12.5
   */
  @Cron(CronExpression.EVERY_DAY_AT_6AM)
  async scheduleExpiryAlertCheck() {
    if (!this.redisEnabled || !this.expiryQueue) {
      this.logger.warn('Expiry alert check skipped - Redis not available');
      return;
    }

    this.logger.log('Scheduling expiry alert check');
    await this.expiryQueue.add('check-expiry', {
      thresholds: [30, 60, 90], // Days until expiry
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Schedule low stock alert check - runs every 4 hours
   * Requirements: 8.4
   */
  @Cron(CronExpression.EVERY_4_HOURS)
  async scheduleLowStockAlertCheck() {
    if (!this.redisEnabled || !this.lowStockQueue) {
      this.logger.warn('Low stock alert check skipped - Redis not available');
      return;
    }

    this.logger.log('Scheduling low stock alert check');
    await this.lowStockQueue.add('check-low-stock', {
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Manually trigger expiry alert check
   */
  async triggerExpiryCheck(thresholds: number[] = [30, 60, 90]) {
    if (!this.redisEnabled || !this.expiryQueue) {
      this.logger.warn('Cannot trigger expiry check - Redis not available');
      return null;
    }

    this.logger.log('Manually triggering expiry alert check');
    return this.expiryQueue.add('check-expiry', {
      thresholds,
      timestamp: new Date().toISOString(),
      manual: true,
    });
  }

  /**
   * Manually trigger low stock alert check
   */
  async triggerLowStockCheck() {
    if (!this.redisEnabled || !this.lowStockQueue) {
      this.logger.warn('Cannot trigger low stock check - Redis not available');
      return null;
    }

    this.logger.log('Manually triggering low stock alert check');
    return this.lowStockQueue.add('check-low-stock', {
      timestamp: new Date().toISOString(),
      manual: true,
    });
  }

  /**
   * Get queue statistics
   */
  async getQueueStats() {
    if (!this.redisEnabled || !this.expiryQueue || !this.lowStockQueue) {
      return {
        expiryAlerts: { waiting: 0, active: 0, completed: 0, failed: 0 },
        lowStockAlerts: { waiting: 0, active: 0, completed: 0, failed: 0 },
        redisEnabled: false,
      };
    }

    const [expiryStats, lowStockStats] = await Promise.all([
      this.getQueueInfo(this.expiryQueue),
      this.getQueueInfo(this.lowStockQueue),
    ]);

    return {
      expiryAlerts: expiryStats,
      lowStockAlerts: lowStockStats,
      redisEnabled: true,
    };
  }

  private async getQueueInfo(queue: Queue) {
    const [waiting, active, completed, failed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
    ]);

    return { waiting, active, completed, failed };
  }

  async getJobs(status?: string, type?: string): Promise<JobListItem[]> {
    if (!this.redisEnabled || !this.expiryQueue || !this.lowStockQueue) {
      return [];
    }

    const statusMap: Record<string, JobStatus[]> = {
      all: ['waiting', 'active', 'completed', 'failed', 'delayed'],
      pending: ['waiting'],
      active: ['active'],
      completed: ['completed'],
      failed: ['failed'],
      delayed: ['delayed'],
    };

    const queueStatuses = statusMap[status || 'all'] || statusMap.all;

    const [expiryJobs, lowStockJobs] = await Promise.all([
      this.expiryQueue.getJobs(queueStatuses, 0, 100, false),
      this.lowStockQueue.getJobs(queueStatuses, 0, 100, false),
    ]);

    const rows = [
      ...expiryJobs.map((job) => this.mapJob(job, 'expiry_alerts')),
      ...lowStockJobs.map((job) => this.mapJob(job, 'low_stock_alerts')),
    ];

    const filtered =
      type && type !== 'all'
        ? rows.filter((row) => row.type.toLowerCase().includes(type.toLowerCase()))
        : rows;

    return filtered.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  private mapJob(job: any, type: string): JobListItem {
    const status = this.toFrontendStatus(job);
    const progressValue = job.progress();

    return {
      _id: String(job.id),
      name: job.name,
      type,
      status,
      data: (job.data || {}) as Record<string, unknown>,
      progress:
        typeof progressValue === 'number'
          ? progressValue
          : undefined,
      error: job.failedReason || undefined,
      attempts: job.attemptsMade || 0,
      maxAttempts: (job.opts?.attempts as number | undefined) || 1,
      createdAt: new Date(job.timestamp || Date.now()).toISOString(),
      startedAt: job.processedOn
        ? new Date(job.processedOn).toISOString()
        : undefined,
      completedAt: job.finishedOn
        ? new Date(job.finishedOn).toISOString()
        : undefined,
      failedAt:
        status === 'failed' && job.finishedOn
          ? new Date(job.finishedOn).toISOString()
          : undefined,
    };
  }

  private toFrontendStatus(
    job: any,
  ): 'pending' | 'active' | 'completed' | 'failed' | 'delayed' {
    if (job.failedReason) return 'failed';
    if (job.finishedOn) return 'completed';
    if (job.processedOn) return 'active';
    if (job.delay && job.delay > 0) return 'delayed';
    return 'pending';
  }
}
