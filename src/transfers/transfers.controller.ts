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
import { TransfersService } from './transfers.service.js';
import { CreateTransferDto } from './dto/create-transfer.dto.js';
import {
  ApproveTransferDto,
  RejectTransferDto,
} from './dto/approve-transfer.dto.js';
import { TransferFilterDto } from './dto/transfer-filter.dto.js';
import { TransferDocument } from './schemas/transfer.schema.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { CurrentUserData } from '../auth/decorators/current-user.decorator.js';
import { UserRole } from '../users/schemas/user.schema.js';

/**
 * TransfersController
 * REST endpoints for inter-branch transfer management
 * Requirements: 4.1, 4.5, 10.4
 */
@Controller('transfers')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class TransfersController {
  constructor(private readonly transfersService: TransfersService) {}

  /**
   * Create a new transfer request
   * POST /transfers
   * Requirements: 4.1
   */
  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.PHARMACIST)
  async create(
    @Body() createTransferDto: CreateTransferDto,
    @CurrentUser() user: CurrentUserData,
  ): Promise<TransferDocument> {
    return this.transfersService.createTransferRequest(
      createTransferDto,
      user.userId,
    );
  }

  /**
   * Get all transfers with optional filtering
   * GET /transfers
   * GET /transfers?status=pending
   * GET /transfers?branchId={branchId}
   * Requirements: 10.4
   */
  @Get()
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.BRANCH_MANAGER,
    UserRole.PHARMACIST,
    UserRole.AUDITOR,
  )
  async findAll(
    @Query() filter: TransferFilterDto,
  ): Promise<TransferDocument[]> {
    return this.transfersService.findAll(filter);
  }

  /**
   * Get pending transfers
   * GET /transfers/pending
   * Requirements: 10.4
   */
  @Get('pending')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER)
  async findPending(): Promise<TransferDocument[]> {
    return this.transfersService.findPending();
  }

  /**
   * Get pending transfers for a specific branch
   * GET /transfers/pending/branch/:branchId
   */
  @Get('pending/branch/:branchId')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER)
  async findPendingForBranch(
    @Param('branchId') branchId: string,
  ): Promise<TransferDocument[]> {
    return this.transfersService.findPendingForBranch(branchId);
  }

  /**
   * Get transfer statistics
   * GET /transfers/stats
   */
  @Get('stats')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.AUDITOR)
  async getStats(): Promise<{
    pending: number;
    approved: number;
    rejected: number;
    completed: number;
  }> {
    return this.transfersService.getTransferStats();
  }

  /**
   * Get a single transfer by ID
   * GET /transfers/:id
   */
  @Get(':id')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.BRANCH_MANAGER,
    UserRole.PHARMACIST,
    UserRole.AUDITOR,
  )
  async findById(@Param('id') id: string): Promise<TransferDocument> {
    return this.transfersService.findById(id);
  }

  /**
   * Approve a transfer request
   * PATCH /transfers/:id/approve
   * Requirements: 4.5
   */
  @Patch(':id/approve')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER)
  async approve(
    @Param('id') id: string,
    @Body() approveTransferDto: ApproveTransferDto,
    @CurrentUser() user: CurrentUserData,
  ): Promise<TransferDocument> {
    return this.transfersService.approveTransfer(
      id,
      user.userId,
      approveTransferDto,
    );
  }

  /**
   * Reject a transfer request
   * PATCH /transfers/:id/reject
   * Requirements: 4.5
   */
  @Patch(':id/reject')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER)
  async reject(
    @Param('id') id: string,
    @Body() rejectTransferDto: RejectTransferDto,
    @CurrentUser() user: CurrentUserData,
  ): Promise<TransferDocument> {
    return this.transfersService.rejectTransfer(
      id,
      user.userId,
      rejectTransferDto,
    );
  }
}
