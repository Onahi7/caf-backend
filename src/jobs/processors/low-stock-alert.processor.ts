import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import {
  InventoryService,
  LowStockAlert,
} from '../../inventory/inventory.service.js';
import { BranchesService } from '../../branches/branches.service.js';
import { EventsService } from '../../websocket/events.service.js';

/**
 * LowStockAlertProcessor
 * Processes scheduled low stock alert jobs
 * Requirements: 8.4
 * Property 34: Branch-specific low stock alerts
 */
@Processor('low-stock-alerts')
export class LowStockAlertProcessor {
  private readonly logger = new Logger(LowStockAlertProcessor.name);

  constructor(
    private readonly inventoryService: InventoryService,
    private readonly branchesService: BranchesService,
    private readonly eventsService: EventsService,
  ) {}

  /**
   * Process low stock check job
   * Generates branch-specific alerts
   * Property 34: Branch-specific low stock alerts
   */
  @Process('check-low-stock')
  async handleLowStockCheck(job: Job<{ timestamp: string }>) {
    this.logger.log(`Processing low stock check job ${job.id}`);

    const allAlerts: LowStockAlert[] = [];

    try {
      // Get all active branches
      const branches = await this.branchesService.findActive();

      for (const branch of branches) {
        const branchAlerts = await this.inventoryService.generateLowStockAlerts(
          branch._id.toString(),
        );

        // Add branch name to alerts
        for (const alert of branchAlerts) {
          allAlerts.push({
            ...alert,
            branchName: branch.name,
          });
        }
      }

      // Emit alerts via WebSocket (grouped by branch)
      await this.emitAlerts(allAlerts);

      this.logger.log(
        `Low stock check completed. Generated ${allAlerts.length} alerts`,
      );

      return {
        success: true,
        alertsGenerated: allAlerts.length,
        branchesChecked: branches.length,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Low stock check failed: ${errorMessage}`);
      throw error;
    }
  }

  private async emitAlerts(alerts: LowStockAlert[]) {
    // Group alerts by branch
    const alertsByBranch = new Map<string, LowStockAlert[]>();

    for (const alert of alerts) {
      const existing = alertsByBranch.get(alert.branchId) || [];
      existing.push(alert);
      alertsByBranch.set(alert.branchId, existing);
    }

    // Emit to each branch
    for (const [branchId, branchAlerts] of alertsByBranch) {
      this.eventsService.emitInventoryUpdate({
        batchId: 'low-stock-alert',
        productId: 'multiple',
        branchId,
        quantityAvailable: branchAlerts.length,
        updateType: 'adjustment',
        timestamp: new Date(),
      });
    }
  }
}
