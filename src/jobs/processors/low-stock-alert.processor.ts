import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import {
  InventoryService,
  LowStockAlert,
} from '../../inventory/inventory.service.js';
import { BranchesService } from '../../branches/branches.service.js';
import { EventsService } from '../../websocket/events.service.js';
import { NotificationsService } from '../../notifications/notifications.service.js';
import { UsersService } from '../../users/users.service.js';
import { UserRole } from '../../users/schemas/user.schema.js';
import { NotificationSeverity, NotificationType } from '../../notifications/schemas/notification.schema.js';

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
    private readonly notificationsService: NotificationsService,
    private readonly usersService: UsersService,
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

      // Create in-app notifications for branch managers and super admins
      await this.createNotifications(allAlerts);

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

  /**
   * Create in-app notifications for branch managers (per-branch) and super admins (cross-branch).
   * Uses upsert-by-resource so a low-stock product doesn't spam multiple notifications.
   */
  private async createNotifications(alerts: LowStockAlert[]) {
    if (alerts.length === 0) return;

    // Group by branch
    const byBranch = new Map<string, LowStockAlert[]>();
    for (const a of alerts) {
      const list = byBranch.get(a.branchId) || [];
      list.push(a);
      byBranch.set(a.branchId, list);
    }

    // Recipients: branch managers per branch + all super admins
    const superAdmins = await this.usersService.findNotificationRecipients(
      undefined,
      [UserRole.SUPER_ADMIN],
    );

    for (const [branchId, branchAlerts] of byBranch) {
      const branchManagers = await this.usersService.findNotificationRecipients(
        branchId,
        [UserRole.BRANCH_MANAGER],
      );
      const recipients = [...branchManagers, ...superAdmins];
      if (recipients.length === 0) continue;

      const top = branchAlerts[0];
      const total = branchAlerts.length;
      const message =
        total === 1
          ? `${top.productName} is below reorder level (${top.currentStock} / ${top.reorderLevel})`
          : `${total} products are below reorder level in this branch (top: ${top.productName} - ${top.currentStock}/${top.reorderLevel})`;

      for (const user of recipients) {
        for (const alert of branchAlerts.slice(0, 5)) {
          // Limit to top 5 to avoid spam
          try {
            await this.notificationsService.create({
              userId: user._id.toString(),
              branchId,
              type: NotificationType.LOW_STOCK,
              severity:
                alert.currentStock <= 0
                  ? NotificationSeverity.CRITICAL
                  : NotificationSeverity.WARNING,
              title: alert.currentStock <= 0 ? 'Out of stock' : 'Low stock',
              message: `${alert.productName} - ${alert.currentStock} left (reorder at ${alert.reorderLevel})`,
              link: '/admin/inventory',
              resourceId: alert.productId,
              resourceType: 'Product',
              metadata: {
                currentStock: alert.currentStock,
                reorderLevel: alert.reorderLevel,
                branchName: alert.branchName,
              },
            });
          } catch (err) {
            this.logger.warn(
              `Failed to create low-stock notification: ${
                err instanceof Error ? err.message : String(err)
              }`,
            );
          }
        }
        // Aggregate summary notification
        if (total > 1) {
          try {
            await this.notificationsService.create({
              userId: user._id.toString(),
              branchId,
              type: NotificationType.LOW_STOCK,
              severity: NotificationSeverity.WARNING,
              title: `${total} low-stock products`,
              message,
              link: '/admin/inventory',
              resourceId: undefined,
              resourceType: 'LowStockSummary',
              metadata: {
                branchId,
                count: total,
                productIds: branchAlerts.map((a) => a.productId),
              },
            });
          } catch (err) {
            this.logger.warn(
              `Failed to create low-stock summary: ${
                err instanceof Error ? err.message : String(err)
              }`,
            );
          }
        }
      }
    }
  }
}
