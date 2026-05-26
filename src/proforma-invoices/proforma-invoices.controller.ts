import {
  Controller, Get, Post, Patch, Param, Body, Query, UseGuards, Res,
} from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { CurrentUserData } from '../auth/decorators/current-user.decorator.js';
import { UserRole } from '../users/schemas/user.schema.js';
import { ProformaInvoicesService } from './proforma-invoices.service.js';
import {
  CreateProformaDto, RecordPaymentDto, ConvertToSaleDto, ProformaFilterDto,
} from './dto/proforma.dto.js';
import { apiResponse, apiListResponse } from '../common/utils/api-response.util.js';
import { assignResolvedBranchId, requireResolvedBranchId } from '../common/utils/branch-scope.util.js';

@Controller('proforma-invoices')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProformaInvoicesController {
  constructor(private readonly service: ProformaInvoicesService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER)
  async create(
    @Body() dto: CreateProformaDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    const branchId = requireResolvedBranchId(user, dto.branchId);
    const pf = await this.service.create(dto, user.userId, branchId);
    return apiResponse(pf);
  }

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.CASHIER)
  async findAll(
    @Query() filter: ProformaFilterDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    assignResolvedBranchId(user, filter);
    const list = await this.service.findAll(filter as any);
    return apiListResponse(list);
  }

  @Get(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.CASHIER)
  async findById(@Param('id') id: string) {
    const pf = await this.service.findById(id);
    return apiResponse(pf);
  }

  @Patch(':id/submit')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER)
  async submitForApproval(@Param('id') id: string) {
    const pf = await this.service.submitForApproval(id);
    return apiResponse(pf);
  }

  @Patch(':id/approve')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER)
  async approve(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    const pf = await this.service.approve(id, user.userId);
    return apiResponse(pf);
  }

  @Patch(':id/reject')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER)
  async reject(
    @Param('id') id: string,
    @Body('reason') reason: string,
  ) {
    const pf = await this.service.reject(id, reason || 'No reason provided');
    return apiResponse(pf);
  }

  @Post(':id/payments')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.CASHIER)
  async recordPayment(
    @Param('id') id: string,
    @Body() dto: RecordPaymentDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    const pf = await this.service.recordPayment(id, dto, user.userId);
    return apiResponse(pf);
  }

  @Post(':id/convert')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER)
  async convertToSale(
    @Param('id') id: string,
    @Body() dto: ConvertToSaleDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    const result = await this.service.convertToSale(id, dto, user.userId);
    return apiResponse(result);
  }

  @Get(':id/pdf')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.CASHIER)
  async generatePdf(
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const pdf = await this.service.generatePdf(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=proforma-${id}.pdf`);
    res.send(pdf);
  }
}
