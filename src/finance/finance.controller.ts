import { Body, Controller, Get, Post, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { CurrentUserData } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { UserRole } from '../users/schemas/user.schema.js';
import { CreateFinanceTransactionDto } from './dto/create-finance-transaction.dto.js';
import { FinanceTransactionFilterDto } from './dto/finance-transaction-filter.dto.js';
import { FinanceService } from './finance.service.js';
import { IdempotencyGuard } from '../common/guards/idempotency.guard.js';
import { IdempotencyInterceptor } from '../common/interceptors/idempotency.interceptor.js';
import type { FinanceTransactionDocument } from './schemas/finance-transaction.schema.js';

@ApiTags('Finance')
@Controller('finance/transactions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.MARKETER)
  @UseGuards(IdempotencyGuard)
  @UseInterceptors(IdempotencyInterceptor)
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
  ) {
    const { data, total } = await this.financeService.findAll(filter, user);
    return {
      data,
      count: total,
      pagination: {
        page: filter.page || 1,
        limit: filter.limit || 50,
        total,
      },
    };
  }
}
