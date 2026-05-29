import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PromotionsService } from './promotions.service.js';
import { CreatePromotionDto } from './dto/create-promotion.dto.js';
import { UpdatePromotionDto } from './dto/update-promotion.dto.js';
import { CalculateDiscountDto } from './dto/calculate-discount.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { CurrentUserData } from '../auth/decorators/current-user.decorator.js';
import { UserRole } from '../users/schemas/user.schema.js';

@ApiTags('Promotions')
@Controller('promotions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PromotionsController {
  constructor(private readonly promotionsService: PromotionsService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER)
  create(
    @Body() createPromotionDto: CreatePromotionDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.promotionsService.create(createPromotionDto, user.userId);
  }

  @Get()
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.BRANCH_MANAGER,
    UserRole.CASHIER,
  )
  findAll(@Query('branchId') branchId?: string, @Query('search') search?: string) {
    return this.promotionsService.findAllWithSearch(branchId, search);
  }

  @Get('active')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.BRANCH_MANAGER,
    UserRole.CASHIER,
  )
  findActive(@Query('branchId') branchId?: string) {
    return this.promotionsService.findActive(branchId);
  }

  @Get('code/:code')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.BRANCH_MANAGER,
    UserRole.CASHIER,
  )
  findByCode(@Param('code') code: string) {
    return this.promotionsService.findByCode(code);
  }

  @Get(':id')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.BRANCH_MANAGER,
    UserRole.CASHIER,
  )
  findOne(@Param('id') id: string) {
    return this.promotionsService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER)
  update(
    @Param('id') id: string,
    @Body() updatePromotionDto: UpdatePromotionDto,
  ) {
    return this.promotionsService.update(id, updatePromotionDto);
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER)
  remove(@Param('id') id: string) {
    return this.promotionsService.remove(id);
  }

  @Patch(':id/toggle-status')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER)
  toggleStatus(@Param('id') id: string) {
    return this.promotionsService.toggleStatus(id);
  }

  @Post('calculate')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.BRANCH_MANAGER,
    UserRole.CASHIER,
  )
  calculateDiscount(@Body() calculateDiscountDto: CalculateDiscountDto) {
    return this.promotionsService.calculateDiscount(
      calculateDiscountDto.promotionId,
      calculateDiscountDto.items,
      calculateDiscountDto.subtotal,
    );
  }
}
