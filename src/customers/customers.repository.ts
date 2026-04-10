import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Customer } from './schemas/customer.schema';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

@Injectable()
export class CustomersRepository {
  constructor(
    @InjectModel(Customer.name) private customerModel: Model<Customer>,
  ) {}

  async create(createCustomerDto: CreateCustomerDto): Promise<Customer> {
    const customer = new this.customerModel(createCustomerDto);
    return customer.save();
  }

  async findAll(search?: string, includeInactive = false): Promise<Customer[]> {
    const query: Record<string, unknown> = {};

    if (!includeInactive) {
      query.isActive = true;
    }

    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    return this.customerModel.find(query).sort({ createdAt: -1 }).exec();
  }

  async findById(id: string): Promise<Customer | null> {
    return this.customerModel.findById(id).exec();
  }

  async findByPhone(phone: string): Promise<Customer | null> {
    return this.customerModel.findOne({ phone, isActive: true }).exec();
  }

  async findByEmail(email: string): Promise<Customer | null> {
    return this.customerModel.findOne({ email, isActive: true }).exec();
  }

  async update(
    id: string,
    updateCustomerDto: UpdateCustomerDto,
  ): Promise<Customer | null> {
    return this.customerModel
      .findByIdAndUpdate(id, updateCustomerDto, { new: true })
      .exec();
  }

  async delete(id: string): Promise<Customer | null> {
    return this.customerModel
      .findByIdAndUpdate(id, { isActive: false }, { new: true })
      .exec();
  }

  async updateLoyaltyPoints(
    id: string,
    points: number,
  ): Promise<Customer | null> {
    return this.customerModel
      .findByIdAndUpdate(id, { $inc: { loyaltyPoints: points } }, { new: true })
      .exec();
  }

  async toggleStatus(id: string): Promise<Customer | null> {
    const customer = await this.customerModel.findById(id).exec();
    if (!customer) {
      return null;
    }

    customer.isActive = !customer.isActive;
    return customer.save();
  }
}
