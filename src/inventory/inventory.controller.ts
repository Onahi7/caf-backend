import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { InventoryService } from './inventory.service.js';
import { StockMovementFilterDto } from './dto/stock-movement-filter.dto.js';
import { InventoryAdjustmentDto } from './dto/inventory-adjustment.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { CurrentUserData } from '../auth/decorators/current-user.decorator.js';
import { UserRole } from '../users/schemas/user.schema.js';
import { IdempotencyGuard } from '../common/guards/idempotency.guard.js';
import { IdempotencyInterceptor } from '../common/interceptors/idempotency.interceptor.js';

/**
 * Inventory Controller
 * Handles stock movement queries and inventory adjustments
 * Requirements: 3.1, 3.3, 11.2, 11.3
 */
@Controller('inventory')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  /**
   * GET /inventory/stock-movements
   * Get stock movements with filtering
   * Property 12: Stock movements are chronologically ordered
   * Requirements: 3.1, 3.3
   */
  @Get('stock-movements')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.BRANCH_MANAGER,
    UserRole.AUDITOR,
  )
  async getStockMovements(@Query() filter: StockMovementFilterDto) {
    const movements = await this.inventoryService.getMovements(filter);
    return {
      success: true,
      data: movements,
      count: movements.length,
    };
  }

  /**
   * POST /inventory/adjust
   * Create an inventory adjustment
   * Property 45: Adjustment validation
   * Property 46: Adjustment audit trail
   * Requirements: 11.2, 11.3
   */
  @Post('adjust')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER)
  @UseGuards(IdempotencyGuard)
  @UseInterceptors(IdempotencyInterceptor)
  async adjustInventory(
    @Body() dto: InventoryAdjustmentDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    const userId = user.userId;
    const result = await this.inventoryService.adjustInventory(dto, userId);
    return {
      success: true,
      data: result,
    };
  }

  /**
   * GET /inventory/stock-summary
   * Get stock summary for a branch
   */
  @Get('stock-summary')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.BRANCH_MANAGER,
    UserRole.AUDITOR,
  )
  async getStockSummary(@Query('branchId') branchId: string) {
    if (!branchId) {
      throw new BadRequestException('branchId is required');
    }
    const summary =
      await this.inventoryService.getStockSummaryByBranch(branchId);
    return {
      success: true,
      data: summary,
    };
  }

  /**
   * GET /inventory/low-stock-alerts
   * Get low stock alerts for a branch
   * Property 34: Branch-specific low stock alerts
   * Requirements: 8.4
   */
  @Get('low-stock-alerts')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER)
  async getLowStockAlerts(@Query('branchId') branchId: string) {
    if (!branchId) {
      throw new BadRequestException('branchId is required');
    }
    const alerts = await this.inventoryService.generateLowStockAlerts(branchId);
    return {
      success: true,
      data: alerts,
      count: alerts.length,
    };
  }

  /**
   * GET /inventory/batch-stock
   * Calculate stock for a specific batch from movements
   * Property 14: Stock calculation from movements
   */
  @Get('batch-stock')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.BRANCH_MANAGER,
    UserRole.AUDITOR,
  )
  async getBatchStock(@Query('batchId') batchId: string) {
    if (!batchId) {
      throw new BadRequestException('batchId is required');
    }
    const stock = await this.inventoryService.calculateBatchStock(batchId);
    return {
      success: true,
      data: { batchId, calculatedStock: stock },
    };
  }

  /**
   * GET /inventory/product-stock
   * Calculate stock for a product at a branch
   */
  @Get('product-stock')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.BRANCH_MANAGER,
    UserRole.AUDITOR,
  )
  async getProductStock(
    @Query('branchId') branchId: string,
    @Query('productId') productId: string,
  ) {
    if (!branchId || !productId) {
      throw new BadRequestException('branchId and productId are required');
    }
    const stock = await this.inventoryService.calculateProductStockAtBranch(
      branchId,
      productId,
    );
    return {
      success: true,
      data: { branchId, productId, calculatedStock: stock },
    };
  }
}
