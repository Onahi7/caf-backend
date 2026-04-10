import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Supplier, SupplierDocument } from './schemas/supplier.schema.js';
import { CreateSupplierDto } from './dto/create-supplier.dto.js';
import { UpdateSupplierDto } from './dto/update-supplier.dto.js';

@Injectable()
export class SuppliersRepository {
  constructor(
    @InjectModel(Supplier.name) private supplierModel: Model<SupplierDocument>,
  ) {}

  async create(
    createSupplierDto: CreateSupplierDto,
  ): Promise<SupplierDocument> {
    const supplier = new this.supplierModel(createSupplierDto);
    return supplier.save();
  }

  async findAll(): Promise<SupplierDocument[]> {
    return this.supplierModel.find().exec();
  }

  async findActive(): Promise<SupplierDocument[]> {
    return this.supplierModel.find({ isActive: true }).exec();
  }

  async findById(id: string): Promise<SupplierDocument | null> {
    return this.supplierModel.findById(id).exec();
  }

  async findByName(name: string): Promise<SupplierDocument[]> {
    return this.supplierModel
      .find({ name: { $regex: name, $options: 'i' } })
      .exec();
  }

  async update(
    id: string,
    updateSupplierDto: UpdateSupplierDto,
  ): Promise<SupplierDocument | null> {
    return this.supplierModel
      .findByIdAndUpdate(id, updateSupplierDto, { new: true })
      .exec();
  }

  async delete(id: string): Promise<SupplierDocument | null> {
    return this.supplierModel.findByIdAndDelete(id).exec();
  }

  async deactivate(id: string): Promise<SupplierDocument | null> {
    return this.supplierModel
      .findByIdAndUpdate(id, { isActive: false }, { new: true })
      .exec();
  }
}
