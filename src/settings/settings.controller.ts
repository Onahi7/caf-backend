import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { UserRole } from '../users/schemas/user.schema.js';
import { SettingsService } from './settings.service.js';
import { UpdateSystemSettingsDto } from './dto/system-settings.dto.js';
import {
  CreateTaxConfigDto,
  UpdateTaxConfigDto,
} from './dto/tax-config.dto.js';
import {
  CreatePaymentMethodConfigDto,
  UpdatePaymentMethodConfigDto,
} from './dto/payment-method-config.dto.js';

@ApiTags('Settings')
@Controller('settings')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER)
  async getSettings() {
    return this.settingsService.getSystemSettings();
  }

  @Patch()
  @Roles(UserRole.SUPER_ADMIN)
  async updateSettings(@Body() dto: UpdateSystemSettingsDto) {
    return this.settingsService.updateSystemSettings(dto);
  }

  @Get('taxes')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER)
  async findAllTaxes() {
    return this.settingsService.findAllTaxes();
  }

  @Post('taxes')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER)
  async createTax(@Body() dto: CreateTaxConfigDto) {
    return this.settingsService.createTax(dto);
  }

  @Patch('taxes/:id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER)
  async updateTax(@Param('id') id: string, @Body() dto: UpdateTaxConfigDto) {
    return this.settingsService.updateTax(id, dto);
  }

  @Patch('taxes/:id/toggle-status')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER)
  async toggleTaxStatus(@Param('id') id: string) {
    return this.settingsService.toggleTaxStatus(id);
  }

  @Delete('taxes/:id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER)
  async deleteTax(@Param('id') id: string) {
    await this.settingsService.deleteTax(id);
    return { success: true };
  }

  @Get('payment-methods')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER)
  async findAllPaymentMethods() {
    return this.settingsService.findAllPaymentMethods();
  }

  @Post('payment-methods')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER)
  async createPaymentMethod(@Body() dto: CreatePaymentMethodConfigDto) {
    return this.settingsService.createPaymentMethod(dto);
  }

  @Patch('payment-methods/:id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER)
  async updatePaymentMethod(
    @Param('id') id: string,
    @Body() dto: UpdatePaymentMethodConfigDto,
  ) {
    return this.settingsService.updatePaymentMethod(id, dto);
  }

  @Patch('payment-methods/:id/toggle-status')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER)
  async togglePaymentMethodStatus(@Param('id') id: string) {
    return this.settingsService.togglePaymentMethodStatus(id);
  }

  @Delete('payment-methods/:id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER)
  async deletePaymentMethod(@Param('id') id: string) {
    await this.settingsService.deletePaymentMethod(id);
    return { success: true };
  }
}
