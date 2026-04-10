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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/schemas/user.schema';
import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

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
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.CASHIER)
  create(@Body() createCustomerDto: CreateCustomerDto) {
    return this.customersService
      .create(createCustomerDto)
      .then((customer) => this.toResponse(customer));
  }

  @Get()
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.BRANCH_MANAGER,
    UserRole.PHARMACIST,
    UserRole.CASHIER,
    UserRole.AUDITOR,
  )
  async findAll(
    @Query('search') search?: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    const customers = await this.customersService.findAll(
      search,
      includeInactive === 'true',
    );
    return customers.map((customer) => this.toResponse(customer));
  }

  @Get(':id')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.BRANCH_MANAGER,
    UserRole.PHARMACIST,
    UserRole.CASHIER,
    UserRole.AUDITOR,
  )
  async findOne(@Param('id') id: string) {
    const customer = await this.customersService.findOne(id);
    return this.toResponse(customer);
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.CASHIER)
  update(
    @Param('id') id: string,
    @Body() updateCustomerDto: UpdateCustomerDto,
  ) {
    return this.customersService
      .update(id, updateCustomerDto)
      .then((customer) => this.toResponse(customer));
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER)
  remove(@Param('id') id: string) {
    return this.customersService.remove(id);
  }

  @Patch(':id/toggle-status')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER)
  async toggleStatus(@Param('id') id: string) {
    const customer = await this.customersService.toggleStatus(id);
    return this.toResponse(customer);
  }

  @Post(':id/loyalty-points')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.CASHIER)
  addLoyaltyPoints(@Param('id') id: string, @Body('points') points: number) {
    return this.customersService
      .addLoyaltyPoints(id, points)
      .then((customer) => this.toResponse(customer));
  }
}
