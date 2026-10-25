import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { CurrentUserData } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { UserRole } from '../users/schemas/user.schema.js';
import {
  CreateFacilityDto,
  CreateFieldVisitDto,
  DailyFieldReportQueryDto,
  FacilityQueryDto,
  FieldVisitQueryDto,
  UpsertDailyFieldReportDto,
} from './dto/field-operations.dto.js';
import { FieldOperationsService } from './field-operations.service.js';

@ApiTags('Marketer Field Operations')
@Controller('marketer')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FieldOperationsController {
  constructor(private readonly fieldOperationsService: FieldOperationsService) {}

  @Get('zones')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.MARKETER)
  async listZones() {
    return { success: true, data: await this.fieldOperationsService.listZones() };
  }

  @Get('field-summary')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.MARKETER)
  async getFieldSummary(@CurrentUser() actor: CurrentUserData) {
    return { success: true, data: await this.fieldOperationsService.getFieldSummary(actor) };
  }

  @Get('facilities')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.MARKETER)
  async listFacilities(@Query() query: FacilityQueryDto, @CurrentUser() actor: CurrentUserData) {
    const result = await this.fieldOperationsService.listFacilities(query, actor);
    return { success: true, data: result.data, count: result.total, pagination: { page: result.page, limit: result.limit, total: result.total, pages: Math.ceil(result.total / result.limit) } };
  }

  @Post('facilities')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.MARKETER)
  async createFacility(@Body() dto: CreateFacilityDto, @CurrentUser() actor: CurrentUserData) {
    return { success: true, data: await this.fieldOperationsService.createFacility(dto, actor) };
  }

  @Get('visits')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.MARKETER)
  async listVisits(@Query() query: FieldVisitQueryDto, @CurrentUser() actor: CurrentUserData) {
    const result = await this.fieldOperationsService.listVisits(query, actor);
    return { success: true, data: result.data, count: result.total, pagination: { page: result.page, limit: result.limit, total: result.total, pages: Math.ceil(result.total / result.limit) } };
  }

  @Post('visits')
  @Roles(UserRole.MARKETER, UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER)
  async createVisit(@Body() dto: CreateFieldVisitDto, @CurrentUser() actor: CurrentUserData) {
    return { success: true, data: await this.fieldOperationsService.createVisit(dto, actor) };
  }

  @Get('daily-reports')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.MARKETER)
  async listDailyReports(@Query() query: DailyFieldReportQueryDto, @CurrentUser() actor: CurrentUserData) {
    const result = await this.fieldOperationsService.listDailyReports(query, actor);
    return { success: true, data: result.data, count: result.total, pagination: { page: result.page, limit: result.limit, total: result.total, pages: Math.ceil(result.total / result.limit) } };
  }

  @Post('daily-reports')
  @Roles(UserRole.MARKETER, UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER)
  async upsertDailyReport(@Body() dto: UpsertDailyFieldReportDto, @CurrentUser() actor: CurrentUserData) {
    return { success: true, data: await this.fieldOperationsService.upsertDailyReport(dto, actor) };
  }

  @Patch('daily-reports/:id/submit')
  @Roles(UserRole.MARKETER, UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER)
  async submitDailyReport(@Param('id') id: string, @CurrentUser() actor: CurrentUserData) {
    return { success: true, data: await this.fieldOperationsService.submitDailyReport(id, actor) };
  }
}
