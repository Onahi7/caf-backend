import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser, CurrentUserData } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { UserRole } from '../users/schemas/user.schema.js';
import { CreateMarketerAssignmentDto } from './dto/create-marketer-assignment.dto.js';
import { UpdateMarketerAssignmentDto } from './dto/update-marketer-assignment.dto.js';
import { CreateMarketerSaleDto } from './dto/create-marketer-sale.dto.js';
import { MarketerAssignmentQueryDto, MarketerSalesQueryDto } from './dto/marketer-query.dto.js';
import { MarketerService } from './marketer.service.js';

@Controller('marketer')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class MarketerController {
  constructor(private readonly marketerService: MarketerService) {}

  @Post('assignments')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER)
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
    const data = await this.marketerService.listAssignments(query, actor);
    return { data, count: data.length };
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
  async acceptAssignment(
    @Param('id') id: string,
    @CurrentUser() actor: CurrentUserData,
  ) {
    return this.marketerService.acceptAssignment(id, actor);
  }

  @Post('sales')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.MARKETER)
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
    const data = await this.marketerService.listSales(query, actor);
    return { data, count: data.length };
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
