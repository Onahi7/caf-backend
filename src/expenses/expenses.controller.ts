import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ExpensesService } from './expenses.service.js';
import { CreateExpenseDto } from './dto/create-expense.dto.js';
import { ExpenseFilterDto } from './dto/expense-filter.dto.js';
import { ExpenseDocument } from './schemas/expense.schema.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { CurrentUserData } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { UserRole } from '../users/schemas/user.schema.js';
import { resolveBranchId } from '../common/utils/branch-scope.util.js';
import { apiResponse, apiListResponse, apiMessageResponse } from '../common/utils/api-response.util.js';
import { IdempotencyGuard } from '../common/guards/idempotency.guard.js';
import { IdempotencyInterceptor } from '../common/interceptors/idempotency.interceptor.js';

@Controller('expenses')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  /**
   * Create a new expense
   * POST /expenses
   */
  @Post()
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.BRANCH_MANAGER,
    UserRole.CASHIER,
    UserRole.PHARMACIST,
  )
  @UseGuards(IdempotencyGuard)
  @UseInterceptors(IdempotencyInterceptor)
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() createExpenseDto: CreateExpenseDto,
    @CurrentUser() user: CurrentUserData,
  ): Promise<{ success: true; data: ExpenseDocument }> {
    const expense = await this.expensesService.create(createExpenseDto, user.userId);
    return apiResponse(expense);
  }

  /**
   * Get all expenses with optional filtering
   * GET /expenses
   * GET /expenses?branchId={branchId}
   * GET /expenses?shiftId={shiftId}
   * GET /expenses?category={category}
   * GET /expenses?startDate={date}&endDate={date}
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
    @Query() filter: ExpenseFilterDto & { page?: string; limit?: string },
    @CurrentUser() user: CurrentUserData,
  ) {
    filter.branchId = resolveBranchId(user, filter.branchId) as string;
    const p = parseInt(filter.page || '1', 10);
    const l = parseInt(filter.limit || '20', 10);
    const { data, total } = await this.expensesService.findAll({
      ...filter,
      page: p,
      limit: l,
    });
    return {
      success: true,
      data,
      count: total,
      pagination: {
        page: p,
        limit: l,
        total,
        pages: Math.ceil(total / l),
        hasNext: p < Math.ceil(total / l),
        hasPrev: p > 1,
      },
    };
  }

  /**
   * Get expense by ID
   * GET /expenses/:id
   */
  @Get(':id')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.BRANCH_MANAGER,
    UserRole.PHARMACIST,
    UserRole.CASHIER,
    UserRole.AUDITOR,
  )
  async findById(@Param('id') id: string): Promise<{ success: true; data: ExpenseDocument }> {
    const expense = await this.expensesService.findById(id);
    return apiResponse(expense);
  }

  /**
   * Get expenses for a specific shift
   * GET /expenses/shift/:shiftId
   */
  @Get('shift/:shiftId')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.BRANCH_MANAGER,
    UserRole.PHARMACIST,
    UserRole.CASHIER,
    UserRole.AUDITOR,
  )
  async findByShift(
    @Param('shiftId') shiftId: string,
  ): Promise<{ success: true; data: ExpenseDocument[]; count: number }> {
    const expenses = await this.expensesService.findByShift(shiftId);
    return apiListResponse(expenses);
  }

  /**
   * Get expenses for a branch
   * GET /expenses/branch/:branchId
   */
  @Get('branch/:branchId')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.BRANCH_MANAGER,
    UserRole.PHARMACIST,
    UserRole.CASHIER,
    UserRole.AUDITOR,
  )
  async findByBranch(
    @Param('branchId') branchId: string,
    @CurrentUser() user: CurrentUserData,
    @Query('limit') limit?: number,
  ): Promise<{ success: true; data: ExpenseDocument[]; count: number }> {
    const resolvedBranchId = resolveBranchId(user, branchId) as string;
    const expenses = await this.expensesService.findByBranch(resolvedBranchId, limit);
    return apiListResponse(expenses);
  }

  /**
   * Get total expenses for a shift
   * GET /expenses/shift/:shiftId/total
   */
  @Get('shift/:shiftId/total')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.BRANCH_MANAGER,
    UserRole.PHARMACIST,
    UserRole.CASHIER,
    UserRole.AUDITOR,
  )
  async getTotalByShift(
    @Param('shiftId') shiftId: string,
  ): Promise<{ total: number }> {
    const total = await this.expensesService.getTotalByShift(shiftId);
    return { total };
  }

  /**
   * Get expense totals by category
   * GET /expenses/branch/:branchId/by-category
   */
  @Get('branch/:branchId/by-category')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.AUDITOR)
  async getTotalByCategory(
    @Param('branchId') branchId: string,
    @CurrentUser() user: CurrentUserData,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<{ category: string; total: number; count: number }[]> {
    const resolvedBranchId = resolveBranchId(user, branchId) as string;
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    return this.expensesService.getTotalByCategory(resolvedBranchId, start, end);
  }

  /**
   * Soft delete an expense
   * PATCH /expenses/:id/soft-delete
   */
  @Patch(':id/soft-delete')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER)
  async softDelete(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ): Promise<{ success: true; message: string }> {
    await this.expensesService.softDelete(id, user.userId);
    return apiMessageResponse('Expense deleted');
  }
}
