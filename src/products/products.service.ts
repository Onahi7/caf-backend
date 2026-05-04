import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ProductsRepository } from './products.repository.js';
import { CreateProductDto } from './dto/create-product.dto.js';
import { UpdateProductDto } from './dto/update-product.dto.js';
import { ProductSearchDto } from './dto/product-search.dto.js';
import { ProductDocument } from './schemas/product.schema.js';
import { Batch, BatchDocument } from '../batches/schemas/batch.schema.js';
import { InventoryService } from '../inventory/inventory.service.js';
import { AuditService } from '../audit/audit.service.js';
import { UsersService } from '../users/users.service.js';
import { AuditResource } from '../audit/schemas/audit-log.schema.js';

@Injectable()
export class ProductsService {
  constructor(
    private readonly productsRepository: ProductsRepository,
    @InjectModel(Batch.name)
    private readonly batchModel: Model<BatchDocument>,
    private readonly inventoryService: InventoryService,
    private readonly auditService: AuditService,
    private readonly usersService: UsersService,
  ) {}

  private generateSku(name: string): string {
    const parts = name
      .trim()
      .split(/\s+/)
      .map((w) => w.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 3))
      .filter(Boolean);
    const suffix = Date.now().toString(36).toUpperCase().slice(-4);
    return parts.slice(0, 3).join('-') + '-' + suffix;
  }



  async attachSellingPriceAndStock(
    products: ProductDocument[],
    branchId?: string,
  ): Promise<Array<Record<string, unknown>>> {
    if (products.length === 0) {
      return [];
    }

    const productIds = products.map((product) => product._id);
    const match: Record<string, unknown> = {
      productId: { $in: productIds },
      quantityAvailable: { $gt: 0 },
    };

    if (branchId && Types.ObjectId.isValid(branchId)) {
      match.branchId = new Types.ObjectId(branchId);
    }

    const batchRows = await this.batchModel.aggregate<{
      _id: Types.ObjectId;
      stock: number;
      sellingPrice: number;
    }>([
      { $match: match },
      // Business rule: the latest created available batch defines current price.
      { $sort: { createdAt: -1, _id: -1 } },
      {
        $group: {
          _id: '$productId',
          stock: { $sum: '$quantityAvailable' },
          sellingPrice: { $first: '$sellingPrice' },
        },
      },
    ]);

    const batchMap = new Map(
      batchRows.map((row) => [row._id.toString(), row]),
    );

    return products.map((product) => {
      const batchInfo = batchMap.get(product._id.toString());
      const sellingPrice = batchInfo?.sellingPrice ?? 0;
      const stock = batchInfo?.stock ?? 0;

      return {
        ...product.toObject(),
        price: sellingPrice,
        stock,
      };
    });
  }

  async create(
    createProductDto: CreateProductDto,
    userId?: string,
  ): Promise<ProductDocument> {
    // Auto-generate SKU if not provided
    if (!createProductDto.sku) {
      createProductDto.sku = this.generateSku(createProductDto.name);
    }

    // Check if SKU already exists in this branch
    const existingBySku = await this.productsRepository.findBySkuAndBranch(
      createProductDto.sku,
      createProductDto.branchId,
    );
    if (existingBySku) {
      throw new ConflictException(
        'Product with this SKU already exists in this branch',
      );
    }

    // Check if barcode already exists in this branch
    const existingByBarcode =
      await this.productsRepository.findByBarcodeAndBranch(
        createProductDto.barcode,
        createProductDto.branchId,
      );
    if (existingByBarcode) {
      throw new ConflictException(
        'Product with this barcode already exists in this branch',
      );
    }

    const {
      initialStock,
      initialPurchasePrice,
      initialSellingPrice,
      initialLotNumber,
      initialExpiryDate,
      initialSupplierId,
      ...productPayload
    } = createProductDto;

    if ((initialStock ?? 0) > 0) {
      if (!initialSupplierId) {
        throw new BadRequestException(
          'Initial supplier is required when initial stock is provided',
        );
      }
      if (!initialExpiryDate) {
        throw new BadRequestException(
          'Initial expiry date is required when initial stock is provided',
        );
      }
    }

    const product = await this.productsRepository.create(productPayload);

    if ((initialStock ?? 0) > 0) {
      const openingPurchasePrice = initialPurchasePrice ?? product.costPrice;
      const openingSellingPrice =
        initialSellingPrice ??
        (product.suggestedRetailPrice > 0
          ? product.suggestedRetailPrice
          : product.basePrice);

      const [batch] = await this.batchModel.create([
        {
          productId: product._id,
          branchId: product.branchId,
          lotNumber:
            initialLotNumber ||
            `OPEN-${new Date().toISOString().slice(0, 10)}-${product.sku}`,
          expiryDate: new Date(initialExpiryDate!),
          quantityAvailable: initialStock,
          quantityInitial: initialStock,
          purchasePrice: openingPurchasePrice,
          sellingPrice: openingSellingPrice,
          supplierId: initialSupplierId,
          isExpired: false,
          isDepleted: false,
        },
      ]);

      // Record audit trail for the opening stock
      await this.inventoryService.recordPurchaseMovement(
        String(product.branchId),
        String(product._id),
        String(batch._id),
        initialStock!,
        userId ?? 'system',
        'opening-stock',
      );
    }

    // Audit log: product creation
    const actingUser = userId
      ? await this.usersService.findById(userId).catch(() => null)
      : null;
    await this.auditService.logCreate(
      userId ?? 'system',
      actingUser?.username ?? userId ?? 'system',
      AuditResource.PRODUCT,
      product._id.toString(),
      product.toObject(),
      product.branchId.toString(),
      { initialStock: initialStock ?? 0 },
    );

    return product;
  }

  async findAll(branchId?: string): Promise<Array<Record<string, unknown>>> {
    const products = await this.productsRepository.findAll(branchId);
    return this.attachSellingPriceAndStock(products, branchId);
  }

  async findActive(branchId?: string): Promise<Array<Record<string, unknown>>> {
    const products = await this.productsRepository.findActive(branchId);
    return this.attachSellingPriceAndStock(products, branchId);
  }

  async findById(id: string): Promise<ProductDocument> {
    const product = await this.productsRepository.findById(id);
    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }
    return product;
  }

  async findBySku(sku: string): Promise<ProductDocument> {
    const product = await this.productsRepository.findBySku(sku);
    if (!product) {
      throw new NotFoundException(`Product with SKU ${sku} not found`);
    }
    return product;
  }

  async findByBarcode(barcode: string): Promise<ProductDocument> {
    const product = await this.productsRepository.findByBarcode(barcode);
    if (!product) {
      throw new NotFoundException(`Product with barcode ${barcode} not found`);
    }
    return product;
  }

  async search(
    searchDto: ProductSearchDto,
    branchId?: string,
    page: number = 1,
    limit: number = 20,
    sortBy?: string,
    sortOrder: string = 'asc',
  ): Promise<{ data: Array<Record<string, unknown>>; total: number }> {
    const result = await this.productsRepository.search(
      searchDto.query || '',
      branchId,
      searchDto.category,
      searchDto.brand,
      page,
      limit,
      sortBy,
      sortOrder === 'asc' ? 'asc' : 'desc',
    );

    const data = await this.attachSellingPriceAndStock(result.data, branchId);
    return { data, total: result.total };
  }

  async findByCategory(
    category: string,
    branchId?: string,
  ): Promise<ProductDocument[]> {
    return this.productsRepository.findByCategory(category, branchId);
  }

  async findByBrand(
    brand: string,
    branchId?: string,
  ): Promise<ProductDocument[]> {
    return this.productsRepository.findByBrand(brand, branchId);
  }

  async update(
    id: string,
    updateProductDto: UpdateProductDto,
  ): Promise<ProductDocument> {
    const existingProduct = await this.productsRepository.findById(id);
    if (!existingProduct) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }

    const targetBranchId = existingProduct.branchId.toString();

    if (updateProductDto.sku && updateProductDto.sku !== existingProduct.sku) {
      const existingBySku = await this.productsRepository.findBySkuAndBranch(
        updateProductDto.sku,
        targetBranchId,
      );
      if (existingBySku && existingBySku._id.toString() !== id) {
        throw new ConflictException('Product with this SKU already exists');
      }
    }

    if (
      updateProductDto.barcode &&
      updateProductDto.barcode !== existingProduct.barcode
    ) {
      const existingByBarcode =
        await this.productsRepository.findByBarcodeAndBranch(
          updateProductDto.barcode,
          targetBranchId,
        );
      if (existingByBarcode && existingByBarcode._id.toString() !== id) {
        throw new ConflictException('Product with this barcode already exists');
      }
    }

    const product = await this.productsRepository.update(id, updateProductDto);
    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }
    return product;
  }

  async delete(id: string): Promise<void> {
    const product = await this.productsRepository.delete(id);
    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }
  }

  async deactivate(id: string): Promise<ProductDocument> {
    const product = await this.productsRepository.deactivate(id);
    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }
    return product;
  }
}
