import {
  Controller, Get, Post, Patch, Param, Body, Query, UseGuards, UseInterceptors,
  UploadedFile, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { CurrentUserData } from '../auth/decorators/current-user.decorator.js';
import { UserRole } from '../users/schemas/user.schema.js';
import { CustomerOrdersService } from './customer-orders.service.js';
import { UpdateCustomerOrderDto, CustomerOrderFilterDto } from './dto/create-customer-order.dto.js';
import { apiResponse, apiListResponse } from '../common/utils/api-response.util.js';

@Controller('customer-orders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CustomerOrdersController {
  constructor(private readonly service: CustomerOrdersService) {}

  @Post('upload')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.PHARMACIST, UserRole.CASHIER)
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Query('branchId') branchId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    if (!file) throw new BadRequestException('File is required');
    if (!branchId) throw new BadRequestException('branchId is required');
    const order = await this.service.uploadAndProcess(file, branchId, user.userId);
    return apiResponse(order);
  }

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.PHARMACIST, UserRole.CASHIER)
  async findAll(
    @Query() filter: CustomerOrderFilterDto,
  ) {
    const orders = await this.service.findAll(filter as any);
    return apiListResponse(orders);
  }

  @Get(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.PHARMACIST, UserRole.CASHIER)
  async findById(@Param('id') id: string) {
    const order = await this.service.findById(id);
    return apiResponse(order);
  }

  @Patch(':id/items')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER)
  async updateItems(
    @Param('id') id: string,
    @Body() dto: UpdateCustomerOrderDto,
  ) {
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('Items are required');
    }
    const order = await this.service.updateItems(id, dto.items as any);
    return apiResponse(order);
  }
}
