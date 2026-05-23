import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { BatchesService } from './batches.service.js';
import { CreateBatchDto } from './dto/create-batch.dto.js';
import { UpdateBatchDto } from './dto/update-batch.dto.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { UserRole } from '../users/schemas/user.schema.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { CurrentUserData } from '../auth/decorators/current-user.decorator.js';
import {
  requireResolvedBranchId,
  resolveBranchId,
} from '../common/utils/branch-scope.util.js';
import { apiResponse, apiListResponse } from '../common/utils/api-response.util.js';

@Controller('batches')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BatchesController {
  constructor(private readonly batchesService: BatchesService) {}

  /**
   * Create a new batch
   * POST /batches
   * Requirements: 2.1, 2.2
   */
  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.PHARMACIST)
  async create(@Body() createBatchDto: CreateBatchDto) {
    const batch = await this.batchesService.create(createBatchDto);
    return apiResponse(batch);
  }

  /**
   * Get all batches with optional branch filtering
   * GET /batches
   * GET /batches?branchId={branchId}
   * Requirements: 2.1
   */
  @Get()
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.BRANCH_MANAGER,
    UserRole.PHARMACIST,
    UserRole.CASHIER,
    UserRole.AUDITOR,
  )
  async findAll(
    @CurrentUser() user: CurrentUserData,
    @Query('branchId') branchId?: string,
    @Query('productId') productId?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '50',
  ) {
    const currentPage = Math.max(1, parseInt(page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const paginate = <T,>(items: T[]) => {
      const start = (currentPage - 1) * pageSize;
      const data = items.slice(start, start + pageSize);
      const pages = Math.ceil(items.length / pageSize);
      return {
        success: true,
        data,
        count: items.length,
        pagination: {
          page: currentPage,
          limit: pageSize,
          total: items.length,
          pages,
          hasNext: currentPage < pages,
          hasPrev: currentPage > 1,
        },
      };
    };

    const resolvedBranchId = resolveBranchId(user, branchId);
    if (resolvedBranchId && productId) {
      const batches = await this.batchesService.findByBranchAndProduct(resolvedBranchId, productId);
      return paginate(batches);
    }
    if (resolvedBranchId) {
      const batches = await this.batchesService.findByBranch(resolvedBranchId);
      return paginate(batches);
    }
    if (productId) {
      const batches = await this.batchesService.findByProduct(productId);
      return paginate(batches);
    }
    const batches = await this.batchesService.findAll();
    return paginate(batches);
  }

  /**
   * Get batches by product
   * GET /batches/product/:productId
   */
  @Get('product/:productId')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.BRANCH_MANAGER,
    UserRole.PHARMACIST,
    UserRole.CASHIER,
    UserRole.AUDITOR,
  )
  async findByProduct(
    @Param('productId') productId: string,
  ) {
    const batches = await this.batchesService.findByProduct(productId);
    return apiListResponse(batches);
  }

  /**
   * Get batches by branch and product
   * GET /batches/branch/:branchId/product/:productId
   */
  @Get('branch/:branchId/product/:productId')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.BRANCH_MANAGER,
    UserRole.PHARMACIST,
    UserRole.CASHIER,
    UserRole.AUDITOR,
  )
  async findByBranchAndProduct(
    @Param('branchId') branchId: string,
    @CurrentUser() user: CurrentUserData,
    @Param('productId') productId: string,
  ) {
    const resolvedBranchId = requireResolvedBranchId(user, branchId);
    const batches = await this.batchesService.findByBranchAndProduct(resolvedBranchId, productId);
    return apiListResponse(batches);
  }

  /**
   * Get expiring batches for a branch
   * GET /batches/expiring/:branchId?days=30
   */
  @Get('expiring/:branchId')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.BRANCH_MANAGER,
    UserRole.PHARMACIST,
    UserRole.AUDITOR,
  )
  async findExpiring(
    @Param('branchId') branchId: string,
    @CurrentUser() user: CurrentUserData,
    @Query('days') days?: string,
  ) {
    const resolvedBranchId = requireResolvedBranchId(user, branchId);
    const daysUntilExpiry = days ? parseInt(days, 10) : 30;
    const batches = await this.batchesService.findExpiring(resolvedBranchId, daysUntilExpiry);
    return apiListResponse(batches);
  }

  /**
   * Get expired batches
   * GET /batches/expired
   * GET /batches/expired?branchId={branchId}
   */
  @Get('expired')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.BRANCH_MANAGER,
    UserRole.PHARMACIST,
    UserRole.AUDITOR,
  )
  async findExpired(
    @CurrentUser() user: CurrentUserData,
    @Query('branchId') branchId?: string,
  ) {
    const resolvedBranchId = resolveBranchId(user, branchId);
    const batches = await this.batchesService.findExpired(resolvedBranchId);
    return apiListResponse(batches);
  }

  /**
   * Get a single batch by ID
   * GET /batches/:id
   */
  @Get(':id')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.BRANCH_MANAGER,
    UserRole.PHARMACIST,
    UserRole.CASHIER,
    UserRole.AUDITOR,
  )
  async findById(@Param('id') id: string) {
    const batch = await this.batchesService.findById(id);
    return apiResponse(batch);
  }

  /**
   * Update a batch
   * PATCH /batches/:id
   * Requirements: 2.2
   */
  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.PHARMACIST)
  async update(
    @Param('id') id: string,
    @Body() updateBatchDto: UpdateBatchDto,
  ) {
    const batch = await this.batchesService.update(id, updateBatchDto);
    return apiResponse(batch);
  }
}
