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
import { AuthGuard } from '@nestjs/passport';
import { BatchesService } from './batches.service.js';
import { CreateBatchDto } from './dto/create-batch.dto.js';
import { UpdateBatchDto } from './dto/update-batch.dto.js';
import { BatchDocument } from './schemas/batch.schema.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { UserRole } from '../users/schemas/user.schema.js';

@Controller('batches')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class BatchesController {
  constructor(private readonly batchesService: BatchesService) {}

  /**
   * Create a new batch
   * POST /batches
   * Requirements: 2.1, 2.2
   */
  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.PHARMACIST)
  async create(@Body() createBatchDto: CreateBatchDto): Promise<BatchDocument> {
    return this.batchesService.create(createBatchDto);
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
    @Query('branchId') branchId?: string,
    @Query('productId') productId?: string,
  ): Promise<BatchDocument[]> {
    if (branchId && productId) {
      return this.batchesService.findByBranchAndProduct(branchId, productId);
    }
    if (branchId) {
      return this.batchesService.findByBranch(branchId);
    }
    if (productId) {
      return this.batchesService.findByProduct(productId);
    }
    return this.batchesService.findAll();
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
  ): Promise<BatchDocument[]> {
    return this.batchesService.findByProduct(productId);
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
    @Param('productId') productId: string,
  ): Promise<BatchDocument[]> {
    return this.batchesService.findByBranchAndProduct(branchId, productId);
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
    @Query('days') days?: string,
  ): Promise<BatchDocument[]> {
    const daysUntilExpiry = days ? parseInt(days, 10) : 30;
    return this.batchesService.findExpiring(branchId, daysUntilExpiry);
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
    @Query('branchId') branchId?: string,
  ): Promise<BatchDocument[]> {
    return this.batchesService.findExpired(branchId);
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
  async findById(@Param('id') id: string): Promise<BatchDocument> {
    return this.batchesService.findById(id);
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
  ): Promise<BatchDocument> {
    return this.batchesService.update(id, updateBatchDto);
  }
}
