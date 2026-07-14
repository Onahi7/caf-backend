import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { ProductsRepository } from './products.repository.js';
import { CreateProductDto } from './dto/create-product.dto.js';
import { UpdateProductDto } from './dto/update-product.dto.js';
import { ProductSearchDto } from './dto/product-search.dto.js';
import { type ProductDocument } from './schemas/product.schema.js';
import { Batch, BatchDocument } from '../batches/schemas/batch.schema.js';
import { StockMovement, MovementType } from '../inventory/schemas/stock-movement.schema.js';
import { AuditService } from '../audit/audit.service.js';
import { UsersService } from '../users/users.service.js';
import { AuditResource } from '../audit/schemas/audit-log.schema.js';

@Injectable()
export class ProductsService {
  constructor(
    private readonly productsRepository: ProductsRepository,
    private readonly auditService: AuditService,
    private readonly usersService: UsersService,
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Batch.name) private readonly batchModel: Model<BatchDocument>,
    @InjectModel(StockMovement.name) private readonly stockMovementModel: Model<StockMovement>,
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
      const effectiveSellingPrice = this.getEffectiveSellingPrice(product);
      return {
        ...product.toObject(),
        price: effectiveSellingPrice,
        sellingPrice: effectiveSellingPrice,
        stock: product.quantityAvailable ?? 0,
        stockAvailable: product.quantityAvailable ?? 0,
      };
    });
  }

  private getEffectiveSellingPrice(product: {
    suggestedRetailPrice?: number;
    basePrice?: number;
  }): number {
    return (product.suggestedRetailPrice ?? 0) > 0
      ? product.suggestedRetailPrice ?? 0
      : product.basePrice ?? 0;
  }

  private normalizePackSizes(
    packSizes: CreateProductDto['packSizes'] | UpdateProductDto['packSizes'],
    productBarcode?: string,
  ) {
    if (!packSizes) {
      return packSizes;
    }

    const seenCodes = new Set<string>();
    const seenUnits = new Set<string>();
    const seenBarcodes = new Set<string>();

    return packSizes.map((pack, index) => {
      const name = pack.name.trim();
      const unit = (pack.unit || name).trim().toLowerCase().replace(/\s+/g, '-');
      const code = (
        pack.code?.trim() ||
        `${unit}-${pack.quantityPerPack}-${index + 1}`
      )
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-');
      const barcode = pack.barcode?.trim() || undefined;

      if (!name || !unit) {
        throw new BadRequestException('Each pack size requires a name and unit');
      }

      if (seenCodes.has(code)) {
        throw new BadRequestException(`Duplicate pack code: ${code}`);
      }
      seenCodes.add(code);

      if (seenUnits.has(unit)) {
        throw new BadRequestException(`Duplicate pack unit: ${unit}`);
      }
      seenUnits.add(unit);

      if (barcode) {
        if (productBarcode && barcode === productBarcode) {
          throw new BadRequestException(
            'Pack barcode cannot be the same as product barcode',
          );
        }
        if (seenBarcodes.has(barcode)) {
          throw new BadRequestException(`Duplicate pack barcode: ${barcode}`);
        }
        seenBarcodes.add(barcode);
      }

      return {
        ...pack,
        code,
        name,
        unit,
        barcode,
      };
    });
  }

  private normalizeCreateProductPayload(createProductDto: CreateProductDto) {
    const effectiveCostPrice =
      createProductDto.initialPurchasePrice ?? createProductDto.costPrice ?? 0;
    const effectiveSellingPrice =
      createProductDto.initialSellingPrice ??
      createProductDto.suggestedRetailPrice ??
      createProductDto.basePrice ??
      0;

    return {
      ...createProductDto,
      costPrice: effectiveCostPrice,
      basePrice: effectiveSellingPrice,
      suggestedRetailPrice: effectiveSellingPrice,
      packSizes: this.normalizePackSizes(
        createProductDto.packSizes,
        createProductDto.barcode,
      ),
    };
  }

  private normalizeUpdateProductPayload(
    updateProductDto: UpdateProductDto,
    existingProduct: ProductDocument,
  ): UpdateProductDto {
    const nextBarcode = updateProductDto.barcode ?? existingProduct.barcode;
    const normalized: UpdateProductDto = { ...updateProductDto };

    if (
      updateProductDto.basePrice !== undefined ||
      updateProductDto.suggestedRetailPrice !== undefined
    ) {
      const effectiveSellingPrice =
        updateProductDto.suggestedRetailPrice ??
        updateProductDto.basePrice ??
        this.getEffectiveSellingPrice(existingProduct);
      normalized.basePrice = effectiveSellingPrice;
      normalized.suggestedRetailPrice = effectiveSellingPrice;
    }

    if (updateProductDto.packSizes) {
      normalized.packSizes = this.normalizePackSizes(
        updateProductDto.packSizes,
        nextBarcode,
      );
    }

    return normalized;
  }

  private async assertPackBarcodesAreUniqueInBranch(
    packSizes: CreateProductDto['packSizes'] | UpdateProductDto['packSizes'],
    branchId: string,
    currentProductId?: string,
  ): Promise<void> {
    const packBarcodes = (packSizes ?? [])
      .map((pack) => pack.barcode?.trim())
      .filter((barcode): barcode is string => Boolean(barcode));

    for (const barcode of packBarcodes) {
      const existing = await this.productsRepository.findByBarcodeAndBranch(
        barcode,
        branchId,
      );
      if (existing && existing._id.toString() !== currentProductId) {
        throw new ConflictException(
          `Pack barcode ${barcode} is already used by another product or pack`,
        );
      }
    }
  }

  async create(
    createProductDto: CreateProductDto,
    userId?: string,
  ): Promise<ProductDocument> {
    createProductDto = this.normalizeCreateProductPayload(createProductDto);

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

    await this.assertPackBarcodesAreUniqueInBranch(
      createProductDto.packSizes,
      createProductDto.branchId,
    );

    const {
      initialStock,
      initialPurchasePrice: _initialPurchasePrice,
      initialSellingPrice: _initialSellingPrice,
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
      costPrice: productPayload.costPrice,
      basePrice: productPayload.basePrice,
      suggestedRetailPrice: productPayload.suggestedRetailPrice,
      quantityAvailable: initialStock ?? 0,
      quantityInitial: initialStock ?? 0,
      supplierId: effectiveSupplierId,
      supplyDate: initialSupplyDate
        ? new Date(initialSupplyDate)
        : new Date(),
      expiryDate: initialExpiryDate ? new Date(initialExpiryDate) : undefined,
    });

    if ((initialStock ?? 0) > 0) {
      const session = await this.connection.startSession();
      try {
        await session.withTransaction(async () => {
          const lotNumber = createProductDto.initialLotNumber || `OPEN-${Date.now().toString(36).toUpperCase()}`;
          const expiryDate = initialExpiryDate ? new Date(initialExpiryDate) : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
          const effectiveSellingPrice = productPayload.suggestedRetailPrice ?? productPayload.basePrice ?? 0;

          const batchDocs = await this.batchModel.create([{
            productId: product._id,
            branchId: new Types.ObjectId(product.branchId.toString()),
            lotNumber,
            expiryDate,
            quantityAvailable: initialStock!,
            quantityInitial: initialStock!,
            purchasePrice: productPayload.costPrice || 0,
            sellingPrice: effectiveSellingPrice,
            supplierId: new Types.ObjectId(effectiveSupplierId!),
            isExpired: false,
            isDepleted: false,
          }], { session });

          await this.stockMovementModel.create([{
            branchId: new Types.ObjectId(product.branchId.toString()),
            productId: product._id,
            batchId: batchDocs[0]._id,
            quantity: initialStock!,
            movementType: MovementType.PURCHASE,
            reason: 'Opening stock from product creation',
            userId: new Types.ObjectId(userId ?? '000000000000000000000000'),
            referenceId: batchDocs[0]._id,
            referenceType: 'Batch',
            timestamp: new Date(),
          }], { session });
        });
      } finally {
        await session.endSession();
      }
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
    _userId?: string,
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

    updateProductDto = this.normalizeUpdateProductPayload(
      updateProductDto,
      existingProduct,
    );

    await this.assertPackBarcodesAreUniqueInBranch(
      updateProductDto.packSizes,
      targetBranchId,
      id,
    );

    const { quantityAvailable, ...productUpdates } = updateProductDto;
    const product = await this.productsRepository.update(id, productUpdates);
    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }

    if (
      quantityAvailable !== undefined &&
      quantityAvailable !== existingProduct.quantityAvailable
    ) {
      throw new BadRequestException(
        'Stock cannot be edited from the product form. Use batch stock adjustment so the batch and product ledgers remain synchronized.',
      );
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
