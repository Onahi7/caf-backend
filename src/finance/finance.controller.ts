import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { CurrentUserData } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { UserRole } from '../users/schemas/user.schema.js';
import { CreateFinanceTransactionDto } from './dto/create-finance-transaction.dto.js';
import { FinanceTransactionFilterDto } from './dto/finance-transaction-filter.dto.js';
import { FinanceService } from './finance.service.js';
import type { FinanceTransactionDocument } from './schemas/finance-transaction.schema.js';

@Controller('finance/transactions')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.MARKETER)
  async create(
    @Body() createDto: CreateFinanceTransactionDto,
    @CurrentUser() user: CurrentUserData,
  ): Promise<FinanceTransactionDocument> {
    return this.financeService.create(createDto, user);
  }

  @Get('summary')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.BRANCH_MANAGER,
    UserRole.AUDITOR,
    UserRole.MARKETER,
  )
  async getSummary(
    @Query() filter: FinanceTransactionFilterDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.financeService.getSummary(filter, user);
  }

  @Get()
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.BRANCH_MANAGER,
    UserRole.AUDITOR,
    UserRole.MARKETER,
  )
  async findAll(
    @Query() filter: FinanceTransactionFilterDto,
    @CurrentUser() user: CurrentUserData,
  ): Promise<{ data: FinanceTransactionDocument[]; count: number }> {
    const data = await this.financeService.findAll(filter, user);

    return {
      data,
      count: data.length,
    };
  }
}
