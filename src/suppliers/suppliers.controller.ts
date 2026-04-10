import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SuppliersService } from './suppliers.service.js';
import { CreateSupplierDto } from './dto/create-supplier.dto.js';
import { UpdateSupplierDto } from './dto/update-supplier.dto.js';
import { SupplierDocument } from './schemas/supplier.schema.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { UserRole } from '../users/schemas/user.schema.js';

@Controller('suppliers')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  /**
   * Create a new supplier
   * POST /suppliers
   * Requirements: 18.1
   */
  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER)
  async create(
    @Body() createSupplierDto: CreateSupplierDto,
  ): Promise<SupplierDocument> {
    return this.suppliersService.create(createSupplierDto);
  }

  /**
   * Get all suppliers
   * GET /suppliers
   * GET /suppliers?active=true
   * Requirements: 18.1
   */
  @Get()
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.BRANCH_MANAGER,
    UserRole.PHARMACIST,
    UserRole.AUDITOR,
  )
  async findAll(@Query('active') active?: string): Promise<SupplierDocument[]> {
    if (active === 'true') {
      return this.suppliersService.findActive();
    }
    return this.suppliersService.findAll();
  }

  /**
   * Search suppliers by name
   * GET /suppliers/search?name={name}
   * Requirements: 18.1
   */
  @Get('search')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.BRANCH_MANAGER,
    UserRole.PHARMACIST,
    UserRole.AUDITOR,
  )
  async search(@Query('name') name: string): Promise<SupplierDocument[]> {
    return this.suppliersService.findByName(name);
  }

  /**
   * Get a single supplier by ID
   * GET /suppliers/:id
   * Requirements: 18.1
   */
  @Get(':id')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.BRANCH_MANAGER,
    UserRole.PHARMACIST,
    UserRole.AUDITOR,
  )
  async findById(@Param('id') id: string): Promise<SupplierDocument> {
    return this.suppliersService.findById(id);
  }

  /**
   * Update a supplier
   * PATCH /suppliers/:id
   * Requirements: 18.1
   */
  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER)
  async update(
    @Param('id') id: string,
    @Body() updateSupplierDto: UpdateSupplierDto,
  ): Promise<SupplierDocument> {
    return this.suppliersService.update(id, updateSupplierDto);
  }

  /**
   * Deactivate a supplier (soft delete)
   * PATCH /suppliers/:id/deactivate
   * Requirements: 18.1
   */
  @Patch(':id/deactivate')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER)
  async deactivate(@Param('id') id: string): Promise<SupplierDocument> {
    return this.suppliersService.deactivate(id);
  }

  /**
   * Delete a supplier (hard delete)
   * DELETE /suppliers/:id
   * Requirements: 18.1
   */
  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN)
  async delete(@Param('id') id: string): Promise<void> {
    return this.suppliersService.delete(id);
  }
}
