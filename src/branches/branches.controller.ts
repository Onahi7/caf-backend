import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { BranchesService } from './branches.service.js';
import { CreateBranchDto, BranchConfigDto } from './dto/create-branch.dto.js';
import { UpdateBranchDto } from './dto/update-branch.dto.js';
import { BranchDocument } from './schemas/branch.schema.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { UserRole } from '../users/schemas/user.schema.js';

@Controller('branches')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BranchesController {
  constructor(private readonly branchesService: BranchesService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN)
  async create(
    @Body() createBranchDto: CreateBranchDto,
  ): Promise<BranchDocument> {
    return this.branchesService.create(createBranchDto);
  }

  @Get()
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.BRANCH_MANAGER,
    UserRole.PHARMACIST,
    UserRole.CASHIER,
    UserRole.AUDITOR,
  )
  async findAll(): Promise<BranchDocument[]> {
    return this.branchesService.findAll();
  }

  @Get('active')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.BRANCH_MANAGER,
    UserRole.PHARMACIST,
    UserRole.CASHIER,
    UserRole.AUDITOR,
  )
  async findActive(): Promise<BranchDocument[]> {
    return this.branchesService.findActive();
  }

  @Get('headquarters')
  @Roles(UserRole.SUPER_ADMIN, UserRole.AUDITOR)
  async findHeadquarters(): Promise<BranchDocument> {
    return this.branchesService.findHeadquarters();
  }

  @Get(':id')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.BRANCH_MANAGER,
    UserRole.PHARMACIST,
    UserRole.CASHIER,
    UserRole.AUDITOR,
  )
  async findById(@Param('id') id: string): Promise<BranchDocument> {
    return this.branchesService.findById(id);
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER)
  async update(
    @Param('id') id: string,
    @Body() updateBranchDto: UpdateBranchDto,
  ): Promise<BranchDocument> {
    return this.branchesService.update(id, updateBranchDto);
  }

  @Patch(':id/configuration')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER)
  async updateConfiguration(
    @Param('id') id: string,
    @Body() config: BranchConfigDto,
  ): Promise<BranchDocument> {
    return this.branchesService.updateConfiguration(id, config);
  }

  @Post(':id/terminals/:terminalId')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER)
  async assignTerminal(
    @Param('id') branchId: string,
    @Param('terminalId') terminalId: string,
  ): Promise<{ branchId: string; terminalId: string }> {
    return this.branchesService.assignTerminal(branchId, terminalId);
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string): Promise<void> {
    return this.branchesService.delete(id);
  }

  @Patch(':id/deactivate')
  @Roles(UserRole.SUPER_ADMIN)
  async deactivate(@Param('id') id: string): Promise<BranchDocument> {
    return this.branchesService.deactivate(id);
  }
}
