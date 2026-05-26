import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { UserRole } from '../users/schemas/user.schema.js';
import { PrintersService } from './printers.service.js';
import {
  CreatePrinterConfigDto,
  UpdatePrinterConfigDto,
} from './dto/printer-config.dto.js';

@Controller('printers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PrintersController {
  constructor(private readonly printersService: PrintersService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER)
  async create(@Body() createDto: CreatePrinterConfigDto) {
    return this.printersService.create(createDto);
  }

  @Get()
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.BRANCH_MANAGER,
    UserRole.CASHIER,
  )
  async findAll() {
    return this.printersService.findAll();
  }

  @Get('branch/:branchId')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.BRANCH_MANAGER,
    UserRole.CASHIER,
  )
  async findByBranch(@Param('branchId') branchId: string) {
    return this.printersService.findByBranch(branchId);
  }

  @Get('terminal/:branchId/:terminalId')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.BRANCH_MANAGER,
    UserRole.CASHIER,
  )
  async findByTerminal(
    @Param('branchId') branchId: string,
    @Param('terminalId') terminalId: string,
  ) {
    return this.printersService.findByTerminal(branchId, terminalId);
  }

  @Get(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER)
  async findById(@Param('id') id: string) {
    return this.printersService.findById(id);
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER)
  async update(
    @Param('id') id: string,
    @Body() updateDto: UpdatePrinterConfigDto,
  ) {
    return this.printersService.update(id, updateDto);
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER)
  async delete(@Param('id') id: string) {
    return this.printersService.delete(id);
  }

  @Post(':id/test')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER)
  async testConnection(@Param('id') id: string) {
    return this.printersService.testConnection(id);
  }

  @Post('network/print')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.BRANCH_MANAGER,
    UserRole.CASHIER,
  )
  async networkPrint(
    @Body()
    payload: {
      ipAddress: string;
      port: number;
      data: number[];
    },
  ) {
    return this.printersService.networkPrint(payload);
  }
}
