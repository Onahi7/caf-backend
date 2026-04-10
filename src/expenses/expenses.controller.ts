import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ExpensesService } from './expenses.service.js';
import { CreateExpenseDto } from './dto/create-expense.dto.js';
import { ExpenseFilterDto } from './dto/expense-filter.dto.js';
import { ExpenseDocument } from './schemas/expense.schema.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { UserRole } from '../users/schemas/user.schema.js';

@Controller('expenses')
@UseGuards(AuthGuard('jwt'), RolesGuard)
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
  async create(
    @Body() createExpenseDto: CreateExpenseDto,
  ): Promise<ExpenseDocument> {
    return this.expensesService.create(createExpenseDto);
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
  async findAll(@Query() filter: ExpenseFilterDto): Promise<ExpenseDocument[]> {
    return this.expensesService.findAll(filter);
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
  async findById(@Param('id') id: string): Promise<ExpenseDocument> {
    return this.expensesService.findById(id);
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
  ): Promise<ExpenseDocument[]> {
    return this.expensesService.findByShift(shiftId);
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
    @Query('limit') limit?: number,
  ): Promise<ExpenseDocument[]> {
    return this.expensesService.findByBranch(branchId, limit);
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
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<{ category: string; total: number; count: number }[]> {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    return this.expensesService.getTotalByCategory(branchId, start, end);
  }

  /**
   * Soft delete an expense
   * DELETE /expenses/:id
   */
  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER)
  async softDelete(
    @Param('id') id: string,
    @Request() req: any,
  ): Promise<ExpenseDocument> {
    return this.expensesService.softDelete(id, req.user.id);
  }
}
