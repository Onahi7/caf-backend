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
import { DeliveryNotesService } from './delivery-notes.service.js';
import { CreateDeliveryNoteDto, DeliveryNoteFilterDto, MarkDeliveredDto } from './dto/delivery-note.dto.js';
import { apiResponse, apiListResponse } from '../common/utils/api-response.util.js';
import { assignResolvedBranchId } from '../common/utils/branch-scope.util.js';

@Controller('delivery-notes')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DeliveryNotesController {
  constructor(private readonly service: DeliveryNotesService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER)
  async create(
    @Body() dto: CreateDeliveryNoteDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    const dn = await this.service.create(dto, user.userId);
    return apiResponse(dn);
  }

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.CASHIER)
  async findAll(
    @Query() filter: DeliveryNoteFilterDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    assignResolvedBranchId(user, filter);
    const list = await this.service.findAll(filter as any);
    return apiListResponse(list);
  }

  @Get(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.CASHIER)
  async findById(@Param('id') id: string) {
    const dn = await this.service.findById(id);
    return apiResponse(dn);
  }

  @Patch(':id/deliver')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER)
  async markDelivered(
    @Param('id') id: string,
    @Body() dto: MarkDeliveredDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    const dn = await this.service.markDelivered(id, user.userId, dto);
    return apiResponse(dn);
  }

  @Get(':id/pdf')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.CASHIER)
  async generatePdf(
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const pdf = await this.service.generatePdf(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=delivery-note-${id}.pdf`);
    res.send(pdf);
  }
}
