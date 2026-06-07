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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { UserRole } from '../users/schemas/user.schema.js';
import { CustomersService } from './customers.service.js';
import { CreateCustomerDto } from './dto/create-customer.dto.js';
import { UpdateCustomerDto } from './dto/update-customer.dto.js';
import { apiResponse, apiMessageResponse } from '../common/utils/api-response.util.js';

@ApiTags('Customers')
@Controller('customers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  private toResponse(customer: any) {
    const firstName = customer.firstName || '';
    const lastName = customer.lastName || '';
    return {
      ...customer.toObject?.() ?? customer,
      name: `${firstName} ${lastName}`.trim(),
      totalPurchases: customer.totalPurchases || 0,
    };
  }

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.CASHIER, UserRole.MARKETER)
  create(@Body() createCustomerDto: CreateCustomerDto) {
    return this.customersService
      .create(createCustomerDto)
      .then((customer) => apiResponse(this.toResponse(customer)));
  }

  @Get()
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.BRANCH_MANAGER,
    UserRole.CASHIER,
    UserRole.AUDITOR,
    UserRole.MARKETER,
  )
  async findAll(
    @Query('search') search?: string,
    @Query('includeInactive') includeInactive?: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
  ) {
    const p = parseInt(page, 10);
    const l = parseInt(limit, 10);
    const { data, total } = await this.customersService.findAll(
      search,
      includeInactive === 'true',
      p,
      l,
    );
    return {
      success: true,
      data: data.map((customer) => this.toResponse(customer)),
      count: total,
      pagination: {
        page: p,
        limit: l,
        total,
        pages: Math.ceil(total / l),
        hasNext: p < Math.ceil(total / l),
        hasPrev: p > 1,
      },
    };
  }

  @Get(':id')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.BRANCH_MANAGER,
    UserRole.CASHIER,
    UserRole.AUDITOR,
  )
  async findOne(@Param('id') id: string) {
    const customer = await this.customersService.findOne(id);
    return apiResponse(this.toResponse(customer));
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.CASHIER)
  update(
    @Param('id') id: string,
    @Body() updateCustomerDto: UpdateCustomerDto,
  ) {
    return this.customersService
      .update(id, updateCustomerDto)
      .then((customer) => apiResponse(this.toResponse(customer)));
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER)
  async remove(@Param('id') id: string) {
    await this.customersService.remove(id);
    return apiMessageResponse('Customer deleted');
  }

  @Patch(':id/toggle-status')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER)
  async toggleStatus(@Param('id') id: string) {
    const customer = await this.customersService.toggleStatus(id);
    return apiResponse(this.toResponse(customer));
  }

  @Post(':id/loyalty-points')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.CASHIER)
  addLoyaltyPoints(@Param('id') id: string, @Body('points') points: number) {
    return this.customersService
      .addLoyaltyPoints(id, points)
      .then((customer) => apiResponse(this.toResponse(customer)));
  }
}
