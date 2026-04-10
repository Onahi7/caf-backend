import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PurchasesService, ReceiveResult } from './purchases.service.js';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto.js';
import { ReceivePurchaseOrderDto } from './dto/receive-purchase-order.dto.js';
import { PurchaseOrderFilterDto } from './dto/purchase-order-filter.dto.js';
import { PurchaseOrderDocument } from './schemas/purchase-order.schema.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { UserRole } from '../users/schemas/user.schema.js';
import { IdempotencyGuard } from '../common/guards/idempotency.guard.js';
import { IdempotencyInterceptor } from '../common/interceptors/idempotency.interceptor.js';

@Controller('purchase-orders')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class PurchasesController {
  constructor(private readonly purchasesService: PurchasesService) {}

  /**
   * Create a new purchase order
   * POST /purchase-orders
   * Requirements: 19.1
   */
  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER)
  @UseGuards(IdempotencyGuard)
  @UseInterceptors(IdempotencyInterceptor)
  async create(
    @Body() createPurchaseOrderDto: CreatePurchaseOrderDto,
  ): Promise<PurchaseOrderDocument> {
    return this.purchasesService.create(createPurchaseOrderDto);
  }

  /**
   * Get all purchase orders with optional filtering
   * GET /purchase-orders
   * GET /purchase-orders?branchId={branchId}&status={status}
   * Requirements: 19.1
   */
  @Get()
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.BRANCH_MANAGER,
    UserRole.PHARMACIST,
    UserRole.AUDITOR,
  )
  async findAll(
    @Query() filter: PurchaseOrderFilterDto,
  ): Promise<PurchaseOrderDocument[]> {
    if (
      filter.supplierId ||
      filter.branchId ||
      filter.status ||
      filter.startDate ||
      filter.endDate
    ) {
      return this.purchasesService.findByFilter(filter);
    }
    return this.purchasesService.findAll();
  }

  /**
   * Get pending purchase orders
   * GET /purchase-orders/pending
   * Requirements: 19.1
   */
  @Get('pending')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.BRANCH_MANAGER,
    UserRole.PHARMACIST,
    UserRole.AUDITOR,
  )
  async findPending(): Promise<PurchaseOrderDocument[]> {
    return this.purchasesService.findPending();
  }

  /**
   * Get purchase orders by branch
   * GET /purchase-orders/branch/:branchId
   * Requirements: 19.5
   */
  @Get('branch/:branchId')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.BRANCH_MANAGER,
    UserRole.PHARMACIST,
    UserRole.AUDITOR,
  )
  async findByBranch(
    @Param('branchId') branchId: string,
  ): Promise<PurchaseOrderDocument[]> {
    return this.purchasesService.findByBranch(branchId);
  }

  /**
   * Get purchase orders by supplier
   * GET /purchase-orders/supplier/:supplierId
   * Requirements: 18.4
   */
  @Get('supplier/:supplierId')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.BRANCH_MANAGER,
    UserRole.PHARMACIST,
    UserRole.AUDITOR,
  )
  async findBySupplier(
    @Param('supplierId') supplierId: string,
  ): Promise<PurchaseOrderDocument[]> {
    return this.purchasesService.findBySupplier(supplierId);
  }

  /**
   * Get a single purchase order by ID
   * GET /purchase-orders/:id
   * Requirements: 19.1
   */
  @Get(':id')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.BRANCH_MANAGER,
    UserRole.PHARMACIST,
    UserRole.AUDITOR,
  )
  async findById(@Param('id') id: string): Promise<PurchaseOrderDocument> {
    return this.purchasesService.findById(id);
  }

  /**
   * Receive items from a purchase order
   * POST /purchase-orders/:id/receive
   * Requirements: 19.2, 19.4
   */
  @Post(':id/receive')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.PHARMACIST)
  async receive(
    @Param('id') id: string,
    @Body() receiveDto: ReceivePurchaseOrderDto,
  ): Promise<ReceiveResult> {
    return this.purchasesService.receivePurchaseOrder(id, receiveDto);
  }

  /**
   * Cancel a purchase order
   * PATCH /purchase-orders/:id/cancel
   * Requirements: 19.3
   */
  @Patch(':id/cancel')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER)
  async cancel(@Param('id') id: string): Promise<PurchaseOrderDocument> {
    return this.purchasesService.cancel(id);
  }

  /**
   * Delete a purchase order (only if pending)
   * DELETE /purchase-orders/:id
   * Requirements: 19.1
   */
  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN)
  async delete(@Param('id') id: string): Promise<void> {
    return this.purchasesService.delete(id);
  }
}
