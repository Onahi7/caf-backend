import { Injectable, NotFoundException } from '@nestjs/common';
import { SuppliersRepository } from './suppliers.repository.js';
import { CreateSupplierDto } from './dto/create-supplier.dto.js';
import { UpdateSupplierDto } from './dto/update-supplier.dto.js';
import { SupplierDocument } from './schemas/supplier.schema.js';

@Injectable()
export class SuppliersService {
  constructor(private readonly suppliersRepository: SuppliersRepository) {}

  async create(
    createSupplierDto: CreateSupplierDto,
  ): Promise<SupplierDocument> {
    return this.suppliersRepository.create(createSupplierDto);
  }

  async findAll(
    search?: string,
    activeOnly = true,
    page = 1,
    limit = 20,
  ): Promise<{ data: SupplierDocument[]; total: number }> {
    return this.suppliersRepository.findAll(search, activeOnly, page, limit);
  }

  async findActive(): Promise<SupplierDocument[]> {
    return this.suppliersRepository.findActive();
  }

  async findById(id: string): Promise<SupplierDocument> {
    const supplier = await this.suppliersRepository.findById(id);
    if (!supplier) {
      throw new NotFoundException(`Supplier with ID ${id} not found`);
    }
    return supplier;
  }

  async findByName(name: string): Promise<SupplierDocument[]> {
    return this.suppliersRepository.findByName(name);
  }

  async update(
    id: string,
    updateSupplierDto: UpdateSupplierDto,
  ): Promise<SupplierDocument> {
    const supplier = await this.suppliersRepository.update(
      id,
      updateSupplierDto,
    );
    if (!supplier) {
      throw new NotFoundException(`Supplier with ID ${id} not found`);
    }
    return supplier;
  }

  async delete(id: string): Promise<void> {
    const supplier = await this.suppliersRepository.delete(id);
    if (!supplier) {
      throw new NotFoundException(`Supplier with ID ${id} not found`);
    }
  }

  async deactivate(id: string): Promise<SupplierDocument> {
    const supplier = await this.suppliersRepository.deactivate(id);
    if (!supplier) {
      throw new NotFoundException(`Supplier with ID ${id} not found`);
    }
    return supplier;
  }
}
