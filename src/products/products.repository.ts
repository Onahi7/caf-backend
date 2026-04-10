import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Product, ProductDocument } from './schemas/product.schema.js';
import { CreateProductDto } from './dto/create-product.dto.js';
import { UpdateProductDto } from './dto/update-product.dto.js';

@Injectable()
export class ProductsRepository {
  constructor(
    @InjectModel(Product.name) private productModel: Model<ProductDocument>,
  ) {}

  async create(createProductDto: CreateProductDto): Promise<ProductDocument> {
    const product = new this.productModel(createProductDto);
    return product.save();
  }

  async findAll(branchId?: string): Promise<ProductDocument[]> {
    const filter = branchId ? { branchId } : {};
    return this.productModel.find(filter).exec();
  }

  async findActive(branchId?: string): Promise<ProductDocument[]> {
    const filter: Record<string, unknown> = { isActive: true };
    if (branchId) filter.branchId = branchId;
    return this.productModel.find(filter).exec();
  }

  async findById(id: string): Promise<ProductDocument | null> {
    return this.productModel.findById(id).exec();
  }

  async findBySkuAndBranch(
    sku: string,
    branchId: string,
  ): Promise<ProductDocument | null> {
    return this.productModel.findOne({ sku, branchId }).exec();
  }

  async findBySku(sku: string): Promise<ProductDocument | null> {
    return this.productModel.findOne({ sku }).exec();
  }

  async findByBarcodeAndBranch(
    barcode: string,
    branchId: string,
  ): Promise<ProductDocument | null> {
    return this.productModel.findOne({ barcode, branchId }).exec();
  }

  async findByBarcode(barcode: string): Promise<ProductDocument | null> {
    return this.productModel.findOne({ barcode }).exec();
  }

  async findByName(name: string): Promise<ProductDocument | null> {
    return this.productModel.findOne({ name }).exec();
  }

  async search(
    query: string,
    branchId?: string,
    category?: string,
    brand?: string,
  ): Promise<ProductDocument[]> {
    const filter: Record<string, unknown> = {
      $or: [
        { name: { $regex: query, $options: 'i' } },
        { sku: { $regex: query, $options: 'i' } },
        { barcode: { $regex: query, $options: 'i' } },
      ],
    };

    if (branchId) {
      filter.branchId = branchId;
    }

    if (category) {
      filter.category = category;
    }

    if (brand) {
      filter.brand = brand;
    }

    return this.productModel.find(filter).exec();
  }

  async findByCategory(
    category: string,
    branchId?: string,
  ): Promise<ProductDocument[]> {
    const filter: Record<string, unknown> = { category };
    if (branchId) filter.branchId = branchId;
    return this.productModel.find(filter).exec();
  }

  async findByBrand(
    brand: string,
    branchId?: string,
  ): Promise<ProductDocument[]> {
    const filter: Record<string, unknown> = { brand };
    if (branchId) filter.branchId = branchId;
    return this.productModel.find(filter).exec();
  }

  async update(
    id: string,
    updateProductDto: UpdateProductDto,
  ): Promise<ProductDocument | null> {
    return this.productModel
      .findByIdAndUpdate(id, updateProductDto, { new: true })
      .exec();
  }

  async delete(id: string): Promise<ProductDocument | null> {
    return this.productModel.findByIdAndDelete(id).exec();
  }

  async deactivate(id: string): Promise<ProductDocument | null> {
    return this.productModel
      .findByIdAndUpdate(id, { isActive: false }, { new: true })
      .exec();
  }
}
