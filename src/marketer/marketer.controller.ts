import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { CurrentUserData } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { UserRole } from '../users/schemas/user.schema.js';
import { CreateMarketerAssignmentDto } from './dto/create-marketer-assignment.dto.js';
import { UpdateMarketerAssignmentDto } from './dto/update-marketer-assignment.dto.js';
import { CreateMarketerSaleDto } from './dto/create-marketer-sale.dto.js';
import { MarketerAssignmentQueryDto, MarketerSalesQueryDto } from './dto/marketer-query.dto.js';
import { MarketerService } from './marketer.service.js';
import { IdempotencyGuard } from '../common/guards/idempotency.guard.js';
import { IdempotencyInterceptor } from '../common/interceptors/idempotency.interceptor.js';

@Controller('marketer')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MarketerController {
  constructor(private readonly marketerService: MarketerService) {}

  @Post('assignments')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER)
  @UseGuards(IdempotencyGuard)
  @UseInterceptors(IdempotencyInterceptor)
  async createAssignment(
    @Body() dto: CreateMarketerAssignmentDto,
    @CurrentUser() actor: CurrentUserData,
  ) {
    return this.marketerService.createAssignment(dto, actor);
  }

  @Get('assignments')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.MARKETER)
  async listAssignments(
    @Query() query: MarketerAssignmentQueryDto,
    @CurrentUser() actor: CurrentUserData,
  ) {
    const result = await this.marketerService.listAssignments(query, actor);
    return {
      success: true,
      data: result.data,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        pages: Math.ceil(result.total / result.limit),
        hasNext: result.page < Math.ceil(result.total / result.limit),
        hasPrev: result.page > 1,
      },
    };
  }

  @Patch('assignments/:id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER)
  async updateAssignment(
    @Param('id') id: string,
    @Body() dto: UpdateMarketerAssignmentDto,
    @CurrentUser() actor: CurrentUserData,
  ) {
    return this.marketerService.updateAssignment(id, dto, actor);
  }

  @Patch('assignments/:id/accept')
  @Roles(UserRole.MARKETER)
  @UseGuards(IdempotencyGuard)
  @UseInterceptors(IdempotencyInterceptor)
  async acceptAssignment(
    @Param('id') id: string,
    @CurrentUser() actor: CurrentUserData,
  ) {
    return this.marketerService.acceptAssignment(id, actor);
  }

  @Post('sales')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.MARKETER)
  @UseGuards(IdempotencyGuard)
  @UseInterceptors(IdempotencyInterceptor)
  async createSale(
    @Body() dto: CreateMarketerSaleDto,
    @CurrentUser() actor: CurrentUserData,
  ) {
    return this.marketerService.createSale(dto, actor);
  }

  @Get('sales')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.MARKETER)
  async listSales(
    @Query() query: MarketerSalesQueryDto,
    @CurrentUser() actor: CurrentUserData,
  ) {
    const result = await this.marketerService.listSales(query, actor);
    return {
      success: true,
      data: result.data,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        pages: Math.ceil(result.total / result.limit),
        hasNext: result.page < Math.ceil(result.total / result.limit),
        hasPrev: result.page > 1,
      },
    };
  }

  @Get('summary')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.MARKETER)
  async getSummary(
    @Query() query: MarketerSalesQueryDto,
    @CurrentUser() actor: CurrentUserData,
  ) {
    return this.marketerService.getSummary(query, actor);
  }
}
