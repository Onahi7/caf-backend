import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { BatchesService } from '../../batches/batches.service.js';
import { BranchesService } from '../../branches/branches.service.js';
import { EventsService } from '../../websocket/events.service.js';

/**
 * Alert data for expiring batches
 */
export interface ExpiryAlert {
  batchId: string;
  productId: string;
  productName?: string;
  branchId: string;
  branchName?: string;
  lotNumber: string;
  expiryDate: Date;
  daysUntilExpiry: number;
  quantityAvailable: number;
  potentialLoss: number;
  alertLevel: 'critical' | 'warning' | 'info';
}

/**
 * ExpiryAlertProcessor
 * Processes scheduled expiry alert jobs
 * Requirements: 12.5
 * Property 52: Expiry alert generation
 */
@Processor('expiry-alerts')
export class ExpiryAlertProcessor {
  private readonly logger = new Logger(ExpiryAlertProcessor.name);

  constructor(
    private readonly batchesService: BatchesService,
    private readonly branchesService: BranchesService,
    private readonly eventsService: EventsService,
  ) {}

  /**
   * Process expiry check job
   * Generates alerts for 30, 60, 90 day thresholds
   * Property 52: Expiry alert generation
   */
  @Process('check-expiry')
  async handleExpiryCheck(
    job: Job<{ thresholds: number[]; timestamp: string }>,
  ) {
    this.logger.log(`Processing expiry check job ${job.id}`);

    const { thresholds } = job.data;
    const alerts: ExpiryAlert[] = [];

    try {
      // Get all active branches
      const branches = await this.branchesService.findActive();

      for (const branch of branches) {
        // Check each threshold
        for (const days of thresholds) {
          const expiringBatches = await this.batchesService.findExpiring(
            branch._id.toString(),
            days,
          );

          for (const batch of expiringBatches) {
            const daysUntilExpiry = this.calculateDaysUntilExpiry(
              batch.expiryDate,
            );
            const alertLevel = this.determineAlertLevel(daysUntilExpiry);

            // Only add if not already in alerts (avoid duplicates from multiple thresholds)
            const existingAlert = alerts.find(
              (a) => a.batchId === batch._id.toString(),
            );
            if (!existingAlert) {
              alerts.push({
                batchId: batch._id.toString(),
                productId: batch.productId.toString(),
                branchId: branch._id.toString(),
                branchName: branch.name,
                lotNumber: batch.lotNumber,
                expiryDate: batch.expiryDate,
                daysUntilExpiry,
                quantityAvailable: batch.quantityAvailable,
                potentialLoss: batch.quantityAvailable * batch.purchasePrice,
                alertLevel,
              });
            }
          }
        }
      }

      // Mark expired batches
      const expiredCount = await this.batchesService.markExpiredBatches();
      if (expiredCount > 0) {
        this.logger.log(`Marked ${expiredCount} batches as expired`);
      }

      // Emit alerts via WebSocket (grouped by branch)
      await this.emitAlerts(alerts);

      this.logger.log(
        `Expiry check completed. Generated ${alerts.length} alerts`,
      );

      return {
        success: true,
        alertsGenerated: alerts.length,
        expiredMarked: expiredCount,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Expiry check failed: ${errorMessage}`);
      throw error;
    }
  }

  private calculateDaysUntilExpiry(expiryDate: Date): number {
    const now = new Date();
    const expiry = new Date(expiryDate);
    const diffTime = expiry.getTime() - now.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  private determineAlertLevel(
    daysUntilExpiry: number,
  ): 'critical' | 'warning' | 'info' {
    if (daysUntilExpiry <= 30) return 'critical';
    if (daysUntilExpiry <= 60) return 'warning';
    return 'info';
  }

  private async emitAlerts(alerts: ExpiryAlert[]) {
    // Group alerts by branch
    const alertsByBranch = new Map<string, ExpiryAlert[]>();

    for (const alert of alerts) {
      const existing = alertsByBranch.get(alert.branchId) || [];
      existing.push(alert);
      alertsByBranch.set(alert.branchId, existing);
    }

    // Emit to each branch
    for (const [branchId, branchAlerts] of alertsByBranch) {
      this.eventsService.emitBatchUpdate({
        batchId: 'expiry-alert',
        productId: 'multiple',
        branchId,
        quantityAvailable: branchAlerts.length,
        updateType: 'expired',
        timestamp: new Date(),
      });
    }
  }
}
