import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, ClientSession, Model, Types } from 'mongoose';
import { StockMovementRepository } from './stock-movement.repository.js';
import { Product, ProductDocument } from '../products/schemas/product.schema.js';
import { CreateStockMovementDto } from './dto/create-stock-movement.dto.js';
import { StockMovementFilterDto } from './dto/stock-movement-filter.dto.js';
import {
  InventoryAdjustmentDto,
  AdjustmentResult,
} from './dto/inventory-adjustment.dto.js';
import {
  StockMovementDocument,
  MovementType,
} from './schemas/stock-movement.schema.js';
import { EventsService } from '../websocket/events.service.js';
import { AuditService } from '../audit/audit.service.js';
import { UsersService } from '../users/users.service.js';
import { AuditResource } from '../audit/schemas/audit-log.schema.js';
import { BatchesRepository } from '../batches/batches.repository.js';

export interface LowStockAlert {
  productId: string;
  productName?: string;
  branchId: string;
  branchName?: string;
  currentStock: number;
  reorderLevel: number;
  deficit: number;
}

export interface StockSummary {
  productId: string;
  branchId: string;
  totalQuantity: number;
}

@Injectable()
export class InventoryService {
  private readonly DEFAULT_REORDER_LEVEL = 10;
  private readonly logger = new Logger(InventoryService.name);

  constructor(
    private readonly stockMovementRepository: StockMovementRepository,
    private readonly eventsService: EventsService,
    private readonly auditService: AuditService,
    private readonly usersService: UsersService,
    private readonly batchesRepository: BatchesRepository,
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Product.name) private readonly productModel: Model<ProductDocument>,
  ) {}

  private validateQuantity(
    quantity: number,
    allowNegative: boolean = false,
  ): void {
    if (!Number.isFinite(quantity)) {
      throw new BadRequestException(
        'Invalid quantity: must be a finite number',
      );
    }
    if (!allowNegative && quantity < 0) {
      throw new BadRequestException('Invalid quantity: cannot be negative');
    }
    if (quantity === 0) {
      throw new BadRequestException('Invalid quantity: cannot be zero');
    }
  }

  async createMovement(
    dto: CreateStockMovementDto,
    session?: ClientSession,
  ): Promise<StockMovementDocument> {
    return this.stockMovementRepository.create(dto, session);
  }

  async getMovements(
    filter: StockMovementFilterDto,
  ): Promise<StockMovementDocument[]> {
    return this.stockMovementRepository.findWithFilter(filter);
  }

  async getMovementsByBatch(batchId: string): Promise<StockMovementDocument[]> {
    return this.stockMovementRepository.findByBatch(batchId);
  }

  async calculateBatchStock(batchId: string): Promise<number> {
    return this.stockMovementRepository.calculateBatchStock(batchId);
  }

  async calculateProductStockAtBranch(
    branchId: string,
    productId: string,
  ): Promise<number> {
    const product = await this.productModel
      .findOne({
        _id: new Types.ObjectId(productId),
        branchId: new Types.ObjectId(branchId),
      })
      .exec();
    return product?.quantityAvailable ?? 0;
  }

  async adjustInventory(
    dto: InventoryAdjustmentDto,
    userId: string,
  ): Promise<AdjustmentResult> {
    if (!dto.reason || dto.reason.trim() === '') {
      throw new BadRequestException('Adjustment reason is required');
    }
    if (!dto.branchId || !dto.productId || !dto.batchId || !userId) {
      throw new BadRequestException('branchId, productId, batchId, and userId are required');
    }

    this.validateQuantity(dto.quantityChange, true);

    const product = await this.productModel.findById(dto.productId).exec();
    if (!product) {
      throw new NotFoundException(`Product with ID ${dto.productId} not found`);
    }
    if (product.branchId.toString() !== dto.branchId) {
      throw new BadRequestException(
        'Product does not belong to the specified branch',
      );
    }

    const previousQuantity = product.quantityAvailable;
    const session = await this.connection.startSession();
    let updatedProduct: ProductDocument | null = null;
    let movement!: StockMovementDocument;
    let newQuantity!: number;

    try {
      session.startTransaction();

      const batch = await this.batchesRepository.findById(dto.batchId);
      const batchProductId = batch
        ? ((batch.productId as unknown as { _id?: Types.ObjectId })._id ?? batch.productId).toString()
        : undefined;
      const batchBranchId = batch
        ? ((batch.branchId as unknown as { _id?: Types.ObjectId })._id ?? batch.branchId).toString()
        : undefined;
      if (
        !batch ||
        batchProductId !== dto.productId ||
        batchBranchId !== dto.branchId
      ) {
        throw new BadRequestException('Batch does not belong to the specified product and branch');
      }
      await this.batchesRepository.updateQuantity(
        dto.batchId,
        dto.quantityChange,
        session,
      );

      const filter: Record<string, unknown> = {
        _id: new Types.ObjectId(dto.productId),
      };
      if (dto.quantityChange < 0) {
        filter.quantityAvailable = { $gte: -dto.quantityChange };
      }

      updatedProduct = await this.productModel
        .findOneAndUpdate(
          filter,
          { $inc: { quantityAvailable: dto.quantityChange } },
          { new: true, session },
        )
        .exec();

      if (!updatedProduct) {
        throw new BadRequestException(
          `Insufficient stock for product ${dto.productId}: cannot deduct ${-dto.quantityChange} units`,
        );
      }

      newQuantity = updatedProduct.quantityAvailable;

      if (
        dto.quantityChange > 0 &&
        updatedProduct.maxStockLevel > 0 &&
        updatedProduct.quantityAvailable > updatedProduct.maxStockLevel
      ) {
        throw new BadRequestException(
          `Adjustment would exceed the maximum stock level of ${updatedProduct.maxStockLevel} units for this product`,
        );
      }

      movement = await this.stockMovementRepository.create(
        {
          branchId: dto.branchId,
          productId: dto.productId,
          batchId: dto.batchId,
          quantity: dto.quantityChange,
          movementType: MovementType.ADJUSTMENT,
          reason: dto.reason,
          userId,
          metadata: {
            previousQuantity,
            newQuantity,
            approvedBy: userId,
            approvedByNote: dto.approvedBy?.trim() || undefined,
          },
        },
        session,
      );

      await session.commitTransaction();
    } catch (error) {
      if (session.inTransaction()) {
        await session.abortTransaction();
      }
      throw error;
    } finally {
      await session.endSession();
    }

    if (!updatedProduct) {
      throw new NotFoundException(`Product with ID ${dto.productId} not found`);
    }

    const actingUser = await this.usersService.findById(userId).catch(() => null);
    await this.auditService.logUpdate(
      userId,
      actingUser?.username ?? userId,
      AuditResource.INVENTORY,
      dto.productId,
      { previousQuantity },
      { newQuantity, quantityAvailable: updatedProduct.quantityAvailable },
      dto.branchId,
      {
        productId: dto.productId,
        reason: dto.reason,
        adjustmentAmount: dto.quantityChange,
        movementId: movement._id.toString(),
        approvedBy: userId,
        approvedByNote: dto.approvedBy?.trim() || undefined,
      },
    ).catch((error: unknown) => {
      this.logger.error(
        `Inventory adjustment audit failed for product ${dto.productId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    });

    try {
      this.eventsService.emitInventoryUpdate({
        batchId: dto.productId,
        productId: dto.productId,
        branchId: dto.branchId,
        quantityAvailable: updatedProduct.quantityAvailable,
        updateType: 'adjustment',
        timestamp: new Date(),
      });
    } catch (error) {
      this.logger.error(
        `Inventory adjustment event failed for product ${dto.productId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return {
      success: true,
      movementId: movement._id.toString(),
      previousQuantity,
      newQuantity,
      adjustmentAmount: dto.quantityChange,
    };
  }

  async generateLowStockAlerts(branchId: string): Promise<LowStockAlert[]> {
    const products = await this.productModel
      .find({ branchId: new Types.ObjectId(branchId), isActive: true })
      .exec();

    return products
      .filter(
        (product) =>
          product.quantityAvailable <=
          (product.reorderLevel || this.DEFAULT_REORDER_LEVEL),
      )
      .map((product) => ({
        productId: product._id.toString(),
        productName: product.name,
        branchId,
        currentStock: product.quantityAvailable,
        reorderLevel: product.reorderLevel || this.DEFAULT_REORDER_LEVEL,
        deficit:
          (product.reorderLevel || this.DEFAULT_REORDER_LEVEL) -
          product.quantityAvailable,
      }));
  }

  async getStockSummaryByBranch(branchId: string): Promise<StockSummary[]> {
    const products = await this.productModel
      .find({ branchId: new Types.ObjectId(branchId), isActive: true })
      .exec();

    return products.map((product) => ({
      productId: product._id.toString(),
      branchId,
      totalQuantity: product.quantityAvailable,
    }));
  }

  async recordSaleMovement(
    branchId: string,
    productId: string,
    quantity: number,
    userId: string,
    saleId: string,
    session?: ClientSession,
  ): Promise<StockMovementDocument> {
    this.validateQuantity(quantity);

    return this.stockMovementRepository.create(
      {
        branchId,
        productId,
        quantity: -quantity,
        movementType: MovementType.SALE,
        reason: 'Product sale',
        userId,
        referenceId: saleId,
        referenceType: 'Sale',
      },
      session,
    );
  }

  async recordReturnMovement(
    branchId: string,
    productId: string,
    quantity: number,
    userId: string,
    saleId: string,
    reason: string,
    session?: ClientSession,
  ): Promise<StockMovementDocument> {
    this.validateQuantity(quantity);

    return this.stockMovementRepository.create(
      {
        branchId,
        productId,
        quantity,
        movementType: MovementType.RETURN,
        reason,
        userId,
        referenceId: saleId,
        referenceType: 'Sale',
      },
      session,
    );
  }

  async recordPurchaseMovement(
    branchId: string,
    productId: string,
    quantity: number,
    userId: string,
    purchaseOrderId?: string,
    session?: ClientSession,
    reason = 'Purchase order receipt',
  ): Promise<StockMovementDocument> {
    this.validateQuantity(quantity);

    return this.stockMovementRepository.create(
      {
        branchId,
        productId,
        quantity,
        movementType: MovementType.PURCHASE,
        reason,
        userId,
        referenceId: purchaseOrderId,
        referenceType: purchaseOrderId ? 'PurchaseOrder' : undefined,
      },
      session,
    );
  }

  async recordTransferMovement(
    branchId: string,
    productId: string,
    quantity: number,
    userId: string,
    transferId: string,
    isSource: boolean,
    session?: ClientSession,
  ): Promise<StockMovementDocument> {
    this.validateQuantity(quantity);

    return this.stockMovementRepository.create(
      {
        branchId,
        productId,
        quantity: isSource ? -quantity : quantity,
        movementType: MovementType.TRANSFER,
        reason: isSource ? 'Transfer out' : 'Transfer in',
        userId,
        referenceId: transferId,
        referenceType: 'Transfer',
      },
      session,
    );
  }

  async recordDisposalMovement(
    branchId: string,
    productId: string,
    quantity: number,
    userId: string,
    reason: string,
    session?: ClientSession,
  ): Promise<StockMovementDocument> {
    this.validateQuantity(quantity);

    if (!reason || reason.trim() === '') {
      throw new BadRequestException('Disposal reason is required');
    }

    return this.stockMovementRepository.create(
      {
        branchId,
        productId,
        quantity: -quantity,
        movementType: MovementType.DISPOSAL,
        reason,
        userId,
      },
      session,
    );
  }
}
