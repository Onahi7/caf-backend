import {
  Controller, Get, Post, Patch, Param, Body, Query, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { CurrentUserData } from '../auth/decorators/current-user.decorator.js';
import { UserRole } from '../users/schemas/user.schema.js';
import { FinanceManagerService } from './finance-manager.service.js';
import { FinanceAggregationService } from './finance-aggregation.service.js';
import {
  CreateReconciliationDto, ReviewReconciliationDto, ReconciliationFilterDto,
} from './dto/reconciliation.dto.js';
import {
  CreateSalaryDto, UpdateSalaryDto, SalaryFilterDto,
} from './dto/salary.dto.js';
import {
  CreateCashEntryDto, CashEntryFilterDto,
} from './dto/cash-entry.dto.js';
import { DailyFinancePushDto } from './dto/daily-finance-push.dto.js';
import { apiResponse, apiListResponse, apiPaginatedResponse } from '../common/utils/api-response.util.js';
import {
  requireResolvedBranchId,
  resolveBranchId,
} from '../common/utils/branch-scope.util.js';
import { AuditInterceptor } from '../common/interceptors/audit.interceptor.js';
import { Audit } from '../common/decorators/audit.decorator.js';
import { AuditAction, AuditResource } from '../audit/schemas/audit-log.schema.js';

const FINANCE_ROLES = [UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.FINANCE_MANAGER];

@ApiTags('Finance Manager')
@Controller('finance-manager')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(AuditInterceptor)
export class FinanceManagerController {
  constructor(
    private readonly service: FinanceManagerService,
    private readonly aggregation: FinanceAggregationService,
  ) {}

  // --- Unified Dashboard ----------------------------------
  @Get('unified-dashboard')
  @Roles(...FINANCE_ROLES)
  async getUnifiedDashboard(
    @CurrentUser() user: CurrentUserData,
    @Query('branchId') branchId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const resolvedBranchId = resolveBranchId(user, branchId);
    const dashboard = await this.aggregation.getUnifiedDashboard(resolvedBranchId, startDate, endDate);
    return apiResponse(dashboard);
  }

  // --- Cross-Check Reconciliation ------------------------
  @Get('cross-check')
  @Roles(...FINANCE_ROLES)
  async getCrossCheck(
    @CurrentUser() user: CurrentUserData,
    @Query('branchId') branchId: string,
    @Query('date') date?: string,
  ) {
    const resolvedBranchId = requireResolvedBranchId(user, branchId);
    const result = await this.aggregation.getCrossCheckReconciliation(resolvedBranchId, date);
    return apiResponse(result);
  }

  // --- Receivables Aging ----------------------------------
  @Get('receivables/aging')
  @Roles(...FINANCE_ROLES)
  async getReceivablesAging(
    @CurrentUser() user: CurrentUserData,
    @Query('branchId') branchId: string,
    @Query('asOf') asOf?: string,
  ) {
    const resolvedBranchId = resolveBranchId(user, branchId);
    const asOfDate = asOf ? new Date(asOf) : new Date();
    const branchFilter: Record<string, any> = {};
    if (resolvedBranchId) branchFilter.branchId = new Types.ObjectId(resolvedBranchId);
    const result = await this.aggregation.getReceivablesAging(branchFilter, asOfDate);
    return apiResponse(result);
  }

  // --- Finance Push (EMR/LAB -> CAF) ---------------------
  @Post('finance-push')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.FINANCE_MANAGER)
  async receiveFinancePush(
    @Body() dto: DailyFinancePushDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    const result = await this.service.receiveFinancePush(dto, user.userId);
    return apiResponse(result);
  }

  // --- Dashboard --------------------------------------------
  @Get('dashboard')
  @Roles(...FINANCE_ROLES)
  async getDashboard(
    @CurrentUser() user: CurrentUserData,
    @Query('branchId') branchId: string,
  ) {
    const resolvedBranchId = requireResolvedBranchId(user, branchId);
    const dashboard = await this.service.getDashboard(resolvedBranchId);
    return apiResponse(dashboard);
  }

  // --- Reconciliation --------------------------------------
  @Post('reconciliations')
  @Roles(...FINANCE_ROLES)
  @Audit({ action: AuditAction.CREATE, resource: AuditResource.RECONCILIATION, description: 'Created reconciliation' })
  async createReconciliation(
    @Body() dto: CreateReconciliationDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    dto.branchId = requireResolvedBranchId(user, dto.branchId);
    const recon = await this.service.createReconciliation(dto, user.userId);
    return apiResponse(recon);
  }

  @Get('reconciliations')
  @Roles(...FINANCE_ROLES)
  async findAllReconciliations(
    @CurrentUser() user: CurrentUserData,
    @Query() filter: ReconciliationFilterDto,
  ) {
    filter.branchId = resolveBranchId(user, filter.branchId);
    const list = await this.service.findAllReconciliations(filter);
    return apiListResponse(list);
  }

  @Get('reconciliations/:id')
  @Roles(...FINANCE_ROLES)
  async findReconciliationById(@Param('id') id: string) {
    const recon = await this.service.findReconciliationById(id);
    return apiResponse(recon);
  }

  @Patch('reconciliations/:id/review')
  @Roles(...FINANCE_ROLES)
  @Audit({ action: AuditAction.APPROVE, resource: AuditResource.RECONCILIATION, resourceIdParam: 'id', description: 'Reviewed reconciliation' })
  async reviewReconciliation(
    @Param('id') id: string,
    @Body() dto: ReviewReconciliationDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    const recon = await this.service.reviewReconciliation(id, dto, user.userId);
    return apiResponse(recon);
  }

  @Get('reconciliations/stats/summary')
  @Roles(...FINANCE_ROLES)
  async getReconciliationStats(
    @CurrentUser() user: CurrentUserData,
    @Query('branchId') branchId: string,
  ) {
    const resolvedBranchId = resolveBranchId(user, branchId);
    const stats = await this.service.getReconciliationStats(resolvedBranchId);
    return apiResponse(stats);
  }

  // --- Salaries --------------------------------------------
  @Post('salaries')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.FINANCE_MANAGER)
  @Audit({ action: AuditAction.CREATE, resource: AuditResource.SALARY, description: 'Created salary record' })
  async createSalary(
    @Body() dto: CreateSalaryDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    dto.branchId = requireResolvedBranchId(user, dto.branchId);
    const salary = await this.service.createSalary(dto, user.userId);
    return apiResponse(salary);
  }

  @Get('salaries')
  @Roles(...FINANCE_ROLES)
  async findAllSalaries(
    @CurrentUser() user: CurrentUserData,
    @Query() filter: SalaryFilterDto,
  ) {
    filter.branchId = resolveBranchId(user, filter.branchId);
    const list = await this.service.findAllSalaries(filter);
    return apiListResponse(list);
  }

  @Get('salaries/:id')
  @Roles(...FINANCE_ROLES)
  async findSalaryById(@Param('id') id: string) {
    const salary = await this.service.findSalaryById(id);
    return apiResponse(salary);
  }

  @Patch('salaries/:id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.FINANCE_MANAGER)
  @Audit({ action: AuditAction.UPDATE, resource: AuditResource.SALARY, resourceIdParam: 'id', description: 'Updated salary' })
  async updateSalary(
    @Param('id') id: string,
    @Body() dto: UpdateSalaryDto,
  ) {
    const salary = await this.service.updateSalary(id, dto);
    return apiResponse(salary);
  }

  @Patch('salaries/:id/approve')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER)
  @Audit({ action: AuditAction.APPROVE, resource: AuditResource.SALARY, resourceIdParam: 'id', description: 'Approved salary' })
  async approveSalary(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    const salary = await this.service.approveSalary(id, user.userId);
    return apiResponse(salary);
  }

  @Patch('salaries/:id/pay')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.FINANCE_MANAGER)
  @Audit({ action: AuditAction.UPDATE, resource: AuditResource.SALARY, resourceIdParam: 'id', description: 'Marked salary as paid' })
  async markSalaryPaid(
    @Param('id') id: string,
    @Body('paymentDate') paymentDate?: string,
    @CurrentUser() user?: CurrentUserData,
  ) {
    const salary = await this.service.markSalaryPaid(id, paymentDate, user?.userId);
    return apiResponse(salary);
  }

  @Get('salaries/stats/summary')
  @Roles(...FINANCE_ROLES)
  async getSalaryStats(
    @CurrentUser() user: CurrentUserData,
    @Query('branchId') branchId: string,
    @Query('period') period?: string,
  ) {
    const resolvedBranchId = resolveBranchId(user, branchId);
    const stats = await this.service.getSalaryStats(resolvedBranchId, period);
    return apiResponse(stats);
  }

  @Get('salaries/:id/preview')
  @Roles(...FINANCE_ROLES)
  async previewSalary(@Param('id') id: string) {
    const preview = await this.service.previewSalaryPayroll(id);
    return apiResponse(preview);
  }

  // --- Cash Entries ----------------------------------------
  @Post('cash-entries')
  @Roles(...FINANCE_ROLES)
  @Audit({ action: AuditAction.CREATE, resource: AuditResource.CASH_ENTRY, description: 'Created cash entry' })
  async createCashEntry(
    @Body() dto: CreateCashEntryDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    dto.branchId = requireResolvedBranchId(user, dto.branchId);
    const entry = await this.service.createCashEntry(dto, user.userId);
    return apiResponse(entry);
  }

  @Get('cash-entries')
  @Roles(...FINANCE_ROLES)
  async findAllCashEntries(
    @CurrentUser() user: CurrentUserData,
    @Query() filter: CashEntryFilterDto,
  ) {
    filter.branchId = resolveBranchId(user, filter.branchId);
    const result = await this.service.findAllCashEntries(filter);
    const page = parseInt(filter.page || '1', 10);
    const limit = parseInt(filter.limit || '50', 10);
    return apiPaginatedResponse(result.data, result.total, page, limit);
  }

  @Get('cash-entries/:id')
  @Roles(...FINANCE_ROLES)
  async findCashEntryById(@Param('id') id: string) {
    const entry = await this.service.findCashEntryById(id);
    return apiResponse(entry);
  }

  @Patch('cash-entries/:id/delete')
  @Roles(...FINANCE_ROLES)
  @Audit({ action: AuditAction.DELETE, resource: AuditResource.CASH_ENTRY, resourceIdParam: 'id', description: 'Soft-deleted cash entry' })
  async softDeleteCashEntry(@Param('id') id: string) {
    const entry = await this.service.softDeleteCashEntry(id);
    return apiResponse(entry);
  }

  @Get('cash-entries/stats/summary')
  @Roles(...FINANCE_ROLES)
  async getCashSummary(
    @CurrentUser() user: CurrentUserData,
    @Query('branchId') branchId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const resolvedBranchId = resolveBranchId(user, branchId);
    const summary = await this.service.getCashSummary(resolvedBranchId, startDate, endDate);
    return apiResponse(summary);
  }
}
