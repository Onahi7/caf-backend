import {
  Controller, Get, Post, Patch, Param, Body, Query, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { CurrentUserData } from '../auth/decorators/current-user.decorator.js';
import { UserRole } from '../users/schemas/user.schema.js';
import { LoanService } from './loan.service.js';
import { EmployeeAdvanceService } from './employee-advance.service.js';
import { CreateLoanDto, RecordLoanRepaymentDto, LoanFilterDto } from './dto/loan.dto.js';
import {
  CreateEmployeeAdvanceDto, RecordAdvanceRepaymentDto, WriteOffAdvanceDto, AdvanceFilterDto, GoodsReturnAdvanceDto,
} from './dto/employee-advance.dto.js';
import { apiResponse, apiListResponse } from '../common/utils/api-response.util.js';
import {
  requireResolvedBranchId, resolveBranchId,
} from '../common/utils/branch-scope.util.js';
import { AuditInterceptor } from '../common/interceptors/audit.interceptor.js';
import { Audit } from '../common/decorators/audit.decorator.js';
import { AuditAction, AuditResource } from '../audit/schemas/audit-log.schema.js';

const FINANCE_ROLES = [UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.FINANCE_MANAGER];

@ApiTags('Finance Manager - Loans & Advances')
@Controller('finance-manager')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(AuditInterceptor)
export class LoansAdvancesController {
  constructor(
    private readonly loanService: LoanService,
    private readonly advanceService: EmployeeAdvanceService,
  ) {}

  @Get('loans')
  @Roles(...FINANCE_ROLES)
  async findAllLoans(
    @CurrentUser() user: CurrentUserData,
    @Query() filter: LoanFilterDto,
  ) {
    filter.branchId = resolveBranchId(user, filter.branchId);
    const list = await this.loanService.findAllLoans(filter);
    return apiListResponse(list);
  }

  @Post('loans')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER)
  @Audit({ action: AuditAction.CREATE, resource: AuditResource.LOAN, description: 'Created loan' })
  async createLoan(
    @Body() dto: CreateLoanDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    dto.branchId = requireResolvedBranchId(user, dto.branchId);
    const loan = await this.loanService.createLoan(dto, user.userId);
    return apiResponse(loan);
  }

  @Get('loans/:id')
  @Roles(...FINANCE_ROLES)
  async findLoanById(@Param('id') id: string) {
    const loan = await this.loanService.findLoanById(id);
    return apiResponse(loan);
  }

  @Patch('loans/:id/repay')
  @Roles(...FINANCE_ROLES)
  @Audit({ action: AuditAction.UPDATE, resource: AuditResource.LOAN, resourceIdParam: 'id', description: 'Recorded loan repayment' })
  async recordLoanRepayment(
    @Param('id') id: string,
    @Body() dto: RecordLoanRepaymentDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    const loan = await this.loanService.recordRepayment(id, dto, user.userId);
    return apiResponse(loan);
  }

  @Patch('loans/:id/accrue')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER)
  @Audit({ action: AuditAction.UPDATE, resource: AuditResource.LOAN, resourceIdParam: 'id', description: 'Accrued loan interest' })
  async accrueInterest(
    @Param('id') id: string,
    @Body('months') months: number,
    @CurrentUser() user: CurrentUserData,
  ) {
    const loan = await this.loanService.accrueInterest(id, Number(months) || 1, user.userId);
    return apiResponse(loan);
  }

  @Patch('loans/:id/close')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER)
  @Audit({ action: AuditAction.UPDATE, resource: AuditResource.LOAN, resourceIdParam: 'id', description: 'Closed loan' })
  async closeLoan(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    const loan = await this.loanService.closeLoan(id, user.userId);
    return apiResponse(loan);
  }

  @Patch('loans/:id/cancel')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER)
  @Audit({ action: AuditAction.DELETE, resource: AuditResource.LOAN, resourceIdParam: 'id', description: 'Cancelled loan' })
  async cancelLoan(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    const loan = await this.loanService.cancelLoan(id, reason || 'No reason provided', user.userId);
    return apiResponse(loan);
  }

  @Get('loans/stats/summary')
  @Roles(...FINANCE_ROLES)
  async getLoanStats(
    @CurrentUser() user: CurrentUserData,
    @Query('branchId') branchId: string,
  ) {
    const resolved = resolveBranchId(user, branchId);
    const stats = await this.loanService.getLoanStats(resolved);
    return apiResponse(stats);
  }

  @Get('advances')
  @Roles(...FINANCE_ROLES)
  async findAllAdvances(
    @CurrentUser() user: CurrentUserData,
    @Query() filter: AdvanceFilterDto,
  ) {
    filter.branchId = resolveBranchId(user, filter.branchId);
    const list = await this.advanceService.findAllAdvances(filter);
    return apiListResponse(list);
  }

  @Post('advances')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.FINANCE_MANAGER)
  @Audit({ action: AuditAction.CREATE, resource: AuditResource.ADVANCE, description: 'Created staff advance' })
  async createAdvance(
    @Body() dto: CreateEmployeeAdvanceDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    dto.branchId = requireResolvedBranchId(user, dto.branchId);
    const advance = await this.advanceService.createAdvance(dto, user.userId);
    return apiResponse(advance);
  }

  @Get('advances/:id')
  @Roles(...FINANCE_ROLES)
  async findAdvanceById(@Param('id') id: string) {
    const advance = await this.advanceService.findAdvanceById(id);
    return apiResponse(advance);
  }

  @Patch('advances/:id/repay')
  @Roles(...FINANCE_ROLES)
  @Audit({ action: AuditAction.UPDATE, resource: AuditResource.ADVANCE, resourceIdParam: 'id', description: 'Recorded advance repayment' })
  async recordAdvanceRepayment(
    @Param('id') id: string,
    @Body() dto: RecordAdvanceRepaymentDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    const advance = await this.advanceService.recordRepayment(id, dto, user.userId);
    return apiResponse(advance);
  }

  @Patch('advances/:id/write-off')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER)
  @Audit({ action: AuditAction.DELETE, resource: AuditResource.ADVANCE, resourceIdParam: 'id', description: 'Wrote off staff advance' })
  async writeOffAdvance(
    @Param('id') id: string,
    @Body() dto: WriteOffAdvanceDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    const advance = await this.advanceService.writeOffAdvance(id, dto, user.userId);
    return apiResponse(advance);
  }

  @Patch('advances/:id/goods-return')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.FINANCE_MANAGER)
  @Audit({ action: AuditAction.UPDATE, resource: AuditResource.ADVANCE, resourceIdParam: 'id', description: 'Returned goods for staff advance' })
  async returnAdvanceGoods(
    @Param('id') id: string,
    @Body() dto: GoodsReturnAdvanceDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    const result = await this.advanceService.returnAdvanceGoods(id, dto.items, dto.notes, user.userId);
    return apiResponse(result);
  }

  @Get('advances/stats/summary')
  @Roles(...FINANCE_ROLES)
  async getAdvanceStats(
    @CurrentUser() user: CurrentUserData,
    @Query('branchId') branchId: string,
  ) {
    const resolved = resolveBranchId(user, branchId);
    const stats = await this.advanceService.getAdvanceStats(resolved);
    return apiResponse(stats);
  }

  @Get('advances/by-employee/:employeeId')
  @Roles(...FINANCE_ROLES)
  async getOutstandingByEmployee(
    @Param('employeeId') employeeId: string,
    @CurrentUser() user: CurrentUserData,
    @Query('branchId') branchId: string,
  ) {
    const resolved = resolveBranchId(user, branchId);
    const result = await this.advanceService.getOutstandingByEmployee(employeeId, resolved);
    return apiResponse(result);
  }

  @Get('advances/settlement/:employeeId')
  @Roles(...FINANCE_ROLES)
  async getFinalSettlement(
    @Param('employeeId') employeeId: string,
    @CurrentUser() user: CurrentUserData,
    @Query('branchId') branchId: string,
  ) {
    const resolved = resolveBranchId(user, branchId);
    const result = await this.advanceService.getFinalSettlement(employeeId, resolved);
    return apiResponse(result);
  }
}
