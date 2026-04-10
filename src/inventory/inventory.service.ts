import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, ClientSession, Model } from 'mongoose';
import { StockMovementRepository } from './stock-movement.repository.js';
import { BatchesRepository } from '../batches/batches.repository.js';
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

/**
 * Low stock alert interface
 * Requirements: 8.4
 * Property 34: Branch-specific low stock alerts
 */
export interface LowStockAlert {
  productId: string;
  productName?: string;
  branchId: string;
  branchName?: string;
  currentStock: number;
  reorderLevel: number;
  deficit: number;
}

/**
 * Stock summary for a product at a branch
 */
export interface StockSummary {
  productId: string;
  branchId: string;
  totalQuantity: number;
  batchCount: number;
}

/**
 * InventoryService
 * Handles stock calculations, adjustments, and alerts
 * Requirements: 3.5, 8.4, 11.2
 * Properties: 14, 34, 45, 46
 */
@Injectable()
export class InventoryService {
  private readonly DEFAULT_REORDER_LEVEL = 10;
  
  constructor(
    private readonly stockMovementRepository: StockMovementRepository,
    private readonly batchesRepository: BatchesRepository,
    private readonly eventsService: EventsService,
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Product.name) private readonly productModel: Model<ProductDocument>,
  ) {}

  /**
   * Validate quantity value
   */
  private validateQuantity(quantity: number, allowNegative: boolean = false): void {
    if (!Number.isFinite(quantity)) {
      throw new BadRequestException(
        'Invalid quantity: must be a finite number',
      );
    }
    if (!allowNegative && quantity < 0) {
      throw new BadRequestException(
        'Invalid quantity: cannot be negative',
      );
    }
    if (quantity === 0) {
      throw new BadRequestException(
        'Invalid quantity: cannot be zero',
      );
    }
  }

  /**
   * Create a stock movement record
   * Property 10: Stock movements are comprehensive
   */
  async createMovement(
    dto: CreateStockMovementDto,
    session?: ClientSession,
  ): Promise<StockMovementDocument> {
    return this.stockMovementRepository.create(dto, session);
  }

  /**
   * Get stock movements with filtering
   * Property 12: Stock movements are chronologically ordered
   */
  async getMovements(
    filter: StockMovementFilterDto,
  ): Promise<StockMovementDocument[]> {
    return this.stockMovementRepository.findWithFilter(filter);
  }

  /**
   * Get movements for a specific batch
   */
  async getMovementsByBatch(batchId: string): Promise<StockMovementDocument[]> {
    return this.stockMovementRepository.findByBatch(batchId);
  }

  /**
   * Calculate current stock for a batch from movements
   * Property 14: Stock calculation from movements
   */
  async calculateBatchStock(batchId: string): Promise<number> {
    return this.stockMovementRepository.calculateBatchStock(batchId);
  }

  /**
   * Calculate total stock for a product at a branch
   */
  async calculateProductStockAtBranch(
    branchId: string,
    productId: string,
  ): Promise<number> {
    return this.stockMovementRepository.calculateProductStockAtBranch(
      branchId,
      productId,
    );
  }

  /**
   * Perform inventory adjustment with validation
   * Property 45: Adjustment validation
   * Property 46: Adjustment audit trail
   * Requirements: 11.2, 11.3
   */
  async adjustInventory(
    dto: InventoryAdjustmentDto,
    userId: string,
  ): Promise<AdjustmentResult> {
    // Validate required fields
    if (!dto.reason || dto.reason.trim() === '') {
      throw new BadRequestException('Adjustment reason is required');
    }

    if (!dto.branchId || !dto.batchId || !userId) {
      throw new BadRequestException('branchId, batchId, and userId are required');
    }

    // Validate quantity change
    this.validateQuantity(dto.quantityChange, true); // Allow negative for adjustments

    // Get the batch to validate branch ownership (read is fine outside the
    // transaction — branchId never changes, so there is no TOCTOU risk here).
    const batch = await this.batchesRepository.findById(dto.batchId);
    if (!batch) {
      throw new NotFoundException(`Batch with ID ${dto.batchId} not found`);
    }

    // Verify branch matches
    if (batch.branchId.toString() !== dto.branchId) {
      throw new BadRequestException(
        'Batch does not belong to the specified branch',
      );
    }

    // Note: we no longer pre-check for negative stock here because that check
    // is a TOCTOU race — another request could deplete stock between this read
    // and our write. The atomic updateQuantity enforces the constraint instead.
    const previousQuantity = batch.quantityAvailable;

    // Use transaction for atomicity
    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      // Atomically update batch quantity first so we know the real new value.
      // updateQuantity throws BadRequestException if stock is insufficient.
      const updatedBatch = await this.batchesRepository.updateQuantity(
        dto.batchId,
        dto.quantityChange,
        session,
      );

      const newQuantity = updatedBatch?.quantityAvailable ?? previousQuantity + dto.quantityChange;

      // Enforce max stock level if set (positive-quantity adjustments only)
      if (dto.quantityChange > 0) {
        const product = await this.productModel.findById(batch.productId).session(session);
        if (product?.maxStockLevel && product.maxStockLevel > 0) {
          const totalStock = await this.batchesRepository.getTotalStockForProduct(
            batch.productId.toString(),
            dto.branchId,
            session,
          );
          if (totalStock > product.maxStockLevel) {
            await session.abortTransaction();
            session.endSession();
            throw new BadRequestException(
              `Adjustment would exceed the maximum stock level of ${product.maxStockLevel} units for this product`,
            );
          }
        }
      }

      // Create stock movement record inside the same transaction
      const movement = await this.stockMovementRepository.create(
        {
          branchId: dto.branchId,
          productId: batch.productId.toString(),
          batchId: dto.batchId,
          quantity: dto.quantityChange,
          movementType: MovementType.ADJUSTMENT,
          reason: dto.reason,
          userId: userId,
          metadata: {
            previousQuantity,
            newQuantity,
            approvedBy: dto.approvedBy,
          },
        },
        session,
      );

      await session.commitTransaction();

      // Emit inventory update event after successful transaction
      if (updatedBatch) {
        this.eventsService.emitInventoryUpdate({
          batchId: dto.batchId,
          productId: batch.productId.toString(),
          branchId: dto.branchId,
          quantityAvailable: updatedBatch.quantityAvailable,
          updateType: 'adjustment',
          timestamp: new Date(),
        });
      }

      return {
        success: true,
        movementId: movement._id.toString(),
        previousQuantity,
        newQuantity,
        adjustmentAmount: dto.quantityChange,
      };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  /**
   * Generate low-stock alerts for a branch
   * Property 34: Branch-specific low stock alerts
   * Requirements: 8.4
   */
  async generateLowStockAlerts(branchId: string): Promise<LowStockAlert[]> {
    // Get all batches for the branch with available stock
    const batches = await this.batchesRepository.findByBranch(branchId);

    // Group batches by product and sum quantities
    const productStocks = new Map<
      string,
      { quantity: number; productId: string }
    >();

    for (const batch of batches) {
      if (
        batch.quantityAvailable > 0 &&
        !batch.isExpired &&
        !batch.isDepleted
      ) {
        const productId = batch.productId.toString();
        const existing = productStocks.get(productId);
        if (existing) {
          existing.quantity += batch.quantityAvailable;
        } else {
          productStocks.set(productId, {
            quantity: batch.quantityAvailable,
            productId,
          });
        }
      }
    }

    const alerts: LowStockAlert[] = [];

    // Fetch all products for the branch to get actual reorder levels
    const productIds = Array.from(productStocks.keys());
    
    if (productIds.length === 0) {
      return alerts;
    }

    const products = await this.productModel
      .find({
        _id: { $in: productIds },
        branchId: branchId,
      })
      .exec();

    const productMap = new Map(
      products.map((p) => [p._id.toString(), p])
    );

    for (const [productId, stock] of productStocks) {
      const product = productMap.get(productId);
      const reorderLevel = product?.reorderLevel || this.DEFAULT_REORDER_LEVEL;
      const productName = product?.name;

      if (stock.quantity <= reorderLevel) {
        alerts.push({
          productId,
          productName,
          branchId,
          currentStock: stock.quantity,
          reorderLevel,
          deficit: reorderLevel - stock.quantity,
        });
      }
    }

    return alerts;
  }

  /**
   * Get stock summary for all products at a branch
   */
  async getStockSummaryByBranch(branchId: string): Promise<StockSummary[]> {
    const batches = await this.batchesRepository.findByBranch(branchId);

    const summaryMap = new Map<string, StockSummary>();

    for (const batch of batches) {
      if (!batch.isExpired && !batch.isDepleted) {
        const productId = batch.productId.toString();
        const existing = summaryMap.get(productId);
        if (existing) {
          existing.totalQuantity += batch.quantityAvailable;
          existing.batchCount += 1;
        } else {
          summaryMap.set(productId, {
            productId,
            branchId,
            totalQuantity: batch.quantityAvailable,
            batchCount: 1,
          });
        }
      }
    }

    return Array.from(summaryMap.values());
  }

  /**
   * Record a sale movement (stock decrease)
   */
  async recordSaleMovement(
    branchId: string,
    productId: string,
    batchId: string,
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
        batchId,
        quantity: -quantity, // Negative for sale
        movementType: MovementType.SALE,
        reason: 'Product sale',
        userId,
        referenceId: saleId,
        referenceType: 'Sale',
      },
      session,
    );
  }

  /**
   * Record a return movement (stock increase)
   * Property 44: Return stock increment
   */
  async recordReturnMovement(
    branchId: string,
    productId: string,
    batchId: string,
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
        batchId,
        quantity: quantity, // Positive for return
        movementType: MovementType.RETURN,
        reason,
        userId,
        referenceId: saleId,
        referenceType: 'Sale',
      },
      session,
    );
  }

  /**
   * Record a purchase movement (stock increase)
   */
  async recordPurchaseMovement(
    branchId: string,
    productId: string,
    batchId: string,
    quantity: number,
    userId: string,
    purchaseOrderId: string,
    session?: ClientSession,
  ): Promise<StockMovementDocument> {
    this.validateQuantity(quantity);

    return this.stockMovementRepository.create(
      {
        branchId,
        productId,
        batchId,
        quantity: quantity, // Positive for purchase
        movementType: MovementType.PURCHASE,
        reason: 'Purchase order receipt',
        userId,
        referenceId: purchaseOrderId,
        referenceType: 'PurchaseOrder',
      },
      session,
    );
  }

  /**
   * Record a transfer movement
   * Property 16: Transfer atomicity (handled by caller with transaction)
   */
  async recordTransferMovement(
    branchId: string,
    productId: string,
    batchId: string,
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
        batchId,
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

  /**
   * Record a disposal movement (stock decrease)
   */
  async recordDisposalMovement(
    branchId: string,
    productId: string,
    batchId: string,
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
        batchId,
        quantity: -quantity, // Negative for disposal
        movementType: MovementType.DISPOSAL,
        reason,
        userId,
      },
      session,
    );
  }
}
