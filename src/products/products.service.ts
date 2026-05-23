import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ProductsRepository } from './products.repository.js';
import { CreateProductDto } from './dto/create-product.dto.js';
import { UpdateProductDto } from './dto/update-product.dto.js';
import { ProductSearchDto } from './dto/product-search.dto.js';
import { ProductDocument } from './schemas/product.schema.js';
import { InventoryService } from '../inventory/inventory.service.js';
import { AuditService } from '../audit/audit.service.js';
import { UsersService } from '../users/users.service.js';
import { AuditResource } from '../audit/schemas/audit-log.schema.js';

@Injectable()
export class ProductsService {
  constructor(
    private readonly productsRepository: ProductsRepository,
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
    _branchId?: string,
  ): Promise<Array<Record<string, unknown>>> {
    return products.map((product) => {
      return {
        ...product.toObject(),
        price:
          product.suggestedRetailPrice > 0
            ? product.suggestedRetailPrice
            : product.basePrice,
        stock: product.quantityAvailable ?? 0,
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
      initialLotNumber: _initialLotNumber,
      initialExpiryDate,
      initialSupplierId,
      initialSupplyDate,
      supplierId,
      ...productPayload
    } = createProductDto;
    const effectiveSupplierId = initialSupplierId ?? supplierId;

    if ((initialStock ?? 0) > 0) {
      if (!effectiveSupplierId) {
        throw new BadRequestException(
          'Initial supplier is required when initial stock is provided',
        );
      }
    }

    const product = await this.productsRepository.create({
      ...productPayload,
      costPrice: initialPurchasePrice ?? productPayload.costPrice,
      suggestedRetailPrice:
        initialSellingPrice ?? productPayload.suggestedRetailPrice,
      quantityAvailable: initialStock ?? 0,
      quantityInitial: initialStock ?? 0,
      supplierId: effectiveSupplierId,
      supplyDate: initialSupplyDate
        ? new Date(initialSupplyDate)
        : new Date(),
      expiryDate: initialExpiryDate ? new Date(initialExpiryDate) : undefined,
    });

    if ((initialStock ?? 0) > 0) {
      await this.inventoryService.recordPurchaseMovement(
        String(product.branchId),
        String(product._id),
        initialStock!,
        userId ?? 'system',
        undefined,
        undefined,
        'Opening stock from product creation',
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

  async findByBarcodeForBranch(
    barcode: string,
    branchId?: string,
  ): Promise<ProductDocument> {
    const product = branchId
      ? await this.productsRepository.findByBarcodeAndBranch(barcode, branchId)
      : await this.productsRepository.findByBarcode(barcode);

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
    const query = searchDto.query?.trim();
    return {
      data: query ? data.map((product) => this.withMatchedPack(product, query)) : data,
      total: result.total,
    };
  }

  private withMatchedPack(
    product: Record<string, unknown>,
    query: string,
  ): Record<string, unknown> {
    const packSizes = Array.isArray(product.packSizes)
      ? (product.packSizes as Array<Record<string, unknown>>)
      : [];
    const normalizedQuery = query.toLowerCase();
    const matchedPackSize = packSizes.find((pack) => {
      const barcode = String(pack.barcode ?? '').toLowerCase();
      return barcode.length > 0 && barcode === normalizedQuery;
    });

    return matchedPackSize ? { ...product, matchedPackSize } : product;
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
    userId?: string,
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

    const { quantityAvailable, ...productUpdates } = updateProductDto;
    const product = await this.productsRepository.update(id, productUpdates);
    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }

    if (
      quantityAvailable !== undefined &&
      quantityAvailable !== existingProduct.quantityAvailable
    ) {
      const quantityChange = quantityAvailable - existingProduct.quantityAvailable;
      await this.inventoryService.adjustInventory(
        {
          branchId: targetBranchId,
          productId: id,
          quantityChange,
          reason: 'Stock corrected from product edit',
        },
        userId ?? 'system',
      );

      return this.findById(id);
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
