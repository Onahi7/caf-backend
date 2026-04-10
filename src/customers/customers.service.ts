import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { CustomersRepository } from './customers.repository';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { Customer } from './schemas/customer.schema';

@Injectable()
export class CustomersService {
  constructor(private readonly customersRepository: CustomersRepository) {}

  private normalizeNameFields(data: {
    firstName?: string;
    lastName?: string;
    name?: string;
  }): { firstName: string; lastName: string } {
    let firstName = data.firstName?.trim();
    let lastName = data.lastName?.trim();

    if ((!firstName || !lastName) && data.name) {
      const parts = data.name
        .trim()
        .split(/\s+/)
        .filter(Boolean);

      if (parts.length > 0) {
        firstName = firstName || parts[0];
        lastName = lastName || (parts.length > 1 ? parts.slice(1).join(' ') : parts[0]);
      }
    }

    if (!firstName || !lastName) {
      throw new BadRequestException(
        'Customer first name and last name are required',
      );
    }

    return { firstName, lastName };
  }

  async create(createCustomerDto: CreateCustomerDto): Promise<Customer> {
    const normalizedNames = this.normalizeNameFields(createCustomerDto);
    const normalizedDto = {
      ...createCustomerDto,
      ...normalizedNames,
    } as CreateCustomerDto;

    // Check for duplicate phone or email
    if (normalizedDto.phone) {
      const existingByPhone = await this.customersRepository.findByPhone(
        normalizedDto.phone,
      );
      if (existingByPhone) {
        throw new ConflictException('Customer with this phone already exists');
      }
    }

    if (normalizedDto.email) {
      const existingByEmail = await this.customersRepository.findByEmail(
        normalizedDto.email,
      );
      if (existingByEmail) {
        throw new ConflictException('Customer with this email already exists');
      }
    }

    return this.customersRepository.create(normalizedDto);
  }

  async findAll(search?: string, includeInactive = false): Promise<Customer[]> {
    return this.customersRepository.findAll(search, includeInactive);
  }

  async findOne(id: string): Promise<Customer> {
    const customer = await this.customersRepository.findById(id);
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }
    return customer;
  }

  async update(
    id: string,
    updateCustomerDto: UpdateCustomerDto,
  ): Promise<Customer> {
    const normalizedDto = { ...updateCustomerDto };

    if (
      updateCustomerDto.name ||
      updateCustomerDto.firstName ||
      updateCustomerDto.lastName
    ) {
      const normalizedNames = this.normalizeNameFields(updateCustomerDto);
      Object.assign(normalizedDto, normalizedNames);
    }

    const customer = await this.customersRepository.update(
      id,
      normalizedDto,
    );
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }
    return customer;
  }

  async remove(id: string): Promise<void> {
    const customer = await this.customersRepository.delete(id);
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }
  }

  async addLoyaltyPoints(id: string, points: number): Promise<Customer> {
    const customer = await this.customersRepository.updateLoyaltyPoints(
      id,
      points,
    );
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }
    return customer;
  }

  async toggleStatus(id: string): Promise<Customer> {
    const customer = await this.customersRepository.toggleStatus(id);
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }
    return customer;
  }
}
