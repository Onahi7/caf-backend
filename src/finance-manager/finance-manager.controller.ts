import {
  Controller, Get, Post, Patch, Param, Body, Query, UseGuards,
} from '@nestjs/common';
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
import { apiResponse, apiListResponse } from '../common/utils/api-response.util.js';

const FINANCE_ROLES = [UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.FINANCE_MANAGER];

@Controller('finance-manager')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FinanceManagerController {
  constructor(
    private readonly service: FinanceManagerService,
    private readonly aggregation: FinanceAggregationService,
  ) {}

  // ─── Unified Dashboard ──────────────────────────────────
  @Get('unified-dashboard')
  @Roles(...FINANCE_ROLES)
  async getUnifiedDashboard(
    @Query('branchId') branchId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const dashboard = await this.aggregation.getUnifiedDashboard(branchId, startDate, endDate);
    return apiResponse(dashboard);
  }

  // ─── Cross-Check Reconciliation ────────────────────────
  @Get('cross-check')
  @Roles(...FINANCE_ROLES)
  async getCrossCheck(
    @Query('branchId') branchId: string,
    @Query('date') date?: string,
  ) {
    const result = await this.aggregation.getCrossCheckReconciliation(branchId, date);
    return apiResponse(result);
  }

  // ─── Finance Push (EMR/LAB → CAF) ─────────────────────
  @Post('finance-push')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.FINANCE_MANAGER)
  async receiveFinancePush(
    @Body() dto: DailyFinancePushDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    const result = await this.service.receiveFinancePush(dto, user.userId);
    return apiResponse(result);
  }

  // ─── Dashboard ────────────────────────────────────────────
  @Get('dashboard')
  @Roles(...FINANCE_ROLES)
  async getDashboard(@Query('branchId') branchId: string) {
    const dashboard = await this.service.getDashboard(branchId);
    return apiResponse(dashboard);
  }

  // ─── Reconciliation ──────────────────────────────────────
  @Post('reconciliations')
  @Roles(...FINANCE_ROLES)
  async createReconciliation(
    @Body() dto: CreateReconciliationDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    const recon = await this.service.createReconciliation(dto, user.userId);
    return apiResponse(recon);
  }

  @Get('reconciliations')
  @Roles(...FINANCE_ROLES)
  async findAllReconciliations(@Query() filter: ReconciliationFilterDto) {
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
  async getReconciliationStats(@Query('branchId') branchId: string) {
    const stats = await this.service.getReconciliationStats(branchId);
    return apiResponse(stats);
  }

  // ─── Salaries ────────────────────────────────────────────
  @Post('salaries')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.FINANCE_MANAGER)
  async createSalary(
    @Body() dto: CreateSalaryDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    const salary = await this.service.createSalary(dto, user.userId);
    return apiResponse(salary);
  }

  @Get('salaries')
  @Roles(...FINANCE_ROLES)
  async findAllSalaries(@Query() filter: SalaryFilterDto) {
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
  async updateSalary(
    @Param('id') id: string,
    @Body() dto: UpdateSalaryDto,
  ) {
    const salary = await this.service.updateSalary(id, dto);
    return apiResponse(salary);
  }

  @Patch('salaries/:id/approve')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER)
  async approveSalary(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    const salary = await this.service.approveSalary(id, user.userId);
    return apiResponse(salary);
  }

  @Patch('salaries/:id/pay')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.FINANCE_MANAGER)
  async markSalaryPaid(
    @Param('id') id: string,
    @Body('paymentDate') paymentDate?: string,
  ) {
    const salary = await this.service.markSalaryPaid(id, paymentDate);
    return apiResponse(salary);
  }

  @Get('salaries/stats/summary')
  @Roles(...FINANCE_ROLES)
  async getSalaryStats(
    @Query('branchId') branchId: string,
    @Query('period') period?: string,
  ) {
    const stats = await this.service.getSalaryStats(branchId, period);
    return apiResponse(stats);
  }

  // ─── Cash Entries ────────────────────────────────────────
  @Post('cash-entries')
  @Roles(...FINANCE_ROLES)
  async createCashEntry(
    @Body() dto: CreateCashEntryDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    const entry = await this.service.createCashEntry(dto, user.userId);
    return apiResponse(entry);
  }

  @Get('cash-entries')
  @Roles(...FINANCE_ROLES)
  async findAllCashEntries(@Query() filter: CashEntryFilterDto) {
    const result = await this.service.findAllCashEntries(filter);
    return apiListResponse(result.data);
  }

  @Get('cash-entries/:id')
  @Roles(...FINANCE_ROLES)
  async findCashEntryById(@Param('id') id: string) {
    const entry = await this.service.findCashEntryById(id);
    return apiResponse(entry);
  }

  @Patch('cash-entries/:id/delete')
  @Roles(...FINANCE_ROLES)
  async softDeleteCashEntry(@Param('id') id: string) {
    const entry = await this.service.softDeleteCashEntry(id);
    return apiResponse(entry);
  }

  @Get('cash-entries/stats/summary')
  @Roles(...FINANCE_ROLES)
  async getCashSummary(
    @Query('branchId') branchId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const summary = await this.service.getCashSummary(branchId, startDate, endDate);
    return apiResponse(summary);
  }
}
