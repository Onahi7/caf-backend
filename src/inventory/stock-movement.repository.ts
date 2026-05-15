import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, ClientSession } from 'mongoose';
import {
  StockMovement,
  StockMovementDocument,
} from './schemas/stock-movement.schema.js';
import { CreateStockMovementDto } from './dto/create-stock-movement.dto.js';
import { StockMovementFilterDto } from './dto/stock-movement-filter.dto.js';

/**
 * Repository for stock movement operations
 * Requirements: 3.1, 3.2, 3.3, 3.4
 * Properties: 10, 11, 12, 13
 */
@Injectable()
export class StockMovementRepository {
  constructor(
    @InjectModel(StockMovement.name)
    private stockMovementModel: Model<StockMovementDocument>,
  ) {}

  /**
   * Create a new stock movement record
   * Property 10: Stock movements are comprehensive
   */
  async create(
    dto: CreateStockMovementDto,
    session?: ClientSession,
  ): Promise<StockMovementDocument> {
    const movement = new this.stockMovementModel({
      branchId: new Types.ObjectId(dto.branchId),
      productId: new Types.ObjectId(dto.productId),
      batchId: dto.batchId ? new Types.ObjectId(dto.batchId) : undefined,
      quantity: dto.quantity,
      movementType: dto.movementType,
      reason: dto.reason,
      userId: new Types.ObjectId(dto.userId),
      referenceId: dto.referenceId
        ? new Types.ObjectId(dto.referenceId)
        : undefined,
      referenceType: dto.referenceType,
      timestamp: dto.timestamp || new Date(),
      metadata: dto.metadata,
    });

    if (session) {
      return movement.save({ session });
    }
    return movement.save();
  }

  /**
   * Find stock movements with filtering
   * Property 12: Stock movements are chronologically ordered
   */
  async findWithFilter(
    filter: StockMovementFilterDto,
  ): Promise<StockMovementDocument[]> {
    const query: Record<string, unknown> = {};

    if (filter.branchId) {
      query.branchId = new Types.ObjectId(filter.branchId);
    }
    if (filter.productId) {
      query.productId = new Types.ObjectId(filter.productId);
    }
    if (filter.batchId) {
      query.batchId = new Types.ObjectId(filter.batchId);
    }
    if (filter.userId) {
      query.userId = new Types.ObjectId(filter.userId);
    }
    if (filter.movementType) {
      query.movementType = filter.movementType;
    }

    // Date range filtering
    if (filter.startDate || filter.endDate) {
      query.timestamp = {};
      if (filter.startDate) {
        (query.timestamp as Record<string, unknown>).$gte = filter.startDate;
      }
      if (filter.endDate) {
        (query.timestamp as Record<string, unknown>).$lte = filter.endDate;
      }
    }

    let queryBuilder = this.stockMovementModel
      .find(query)
      .sort({ timestamp: 1 }); // Chronological order (ascending)

    if (filter.skip) {
      queryBuilder = queryBuilder.skip(filter.skip);
    }
    if (filter.limit) {
      queryBuilder = queryBuilder.limit(filter.limit);
    }

    return queryBuilder.exec();
  }

  /**
   * Find all movements for a specific batch
   * Used for stock calculation
   */
  async findByBatch(batchId: string): Promise<StockMovementDocument[]> {
    return this.stockMovementModel
      .find({ batchId: new Types.ObjectId(batchId) })
      .sort({ timestamp: 1 })
      .exec();
  }

  /**
   * Find all movements for a product at a branch
   */
  async findByBranchAndProduct(
    branchId: string,
    productId: string,
  ): Promise<StockMovementDocument[]> {
    return this.stockMovementModel
      .find({
        branchId: new Types.ObjectId(branchId),
        productId: new Types.ObjectId(productId),
      })
      .sort({ timestamp: 1 })
      .exec();
  }

  /**
   * Find movement by ID
   */
  async findById(id: string): Promise<StockMovementDocument | null> {
    return this.stockMovementModel.findById(id).exec();
  }

  /**
   * Calculate total quantity from movements for a batch
   * Property 14: Stock calculation from movements
   */
  async calculateBatchStock(batchId: string): Promise<number> {
    const result = await this.stockMovementModel.aggregate([
      { $match: { batchId: new Types.ObjectId(batchId) } },
      { $group: { _id: null, totalQuantity: { $sum: '$quantity' } } },
    ]);

    return result.length > 0 ? result[0].totalQuantity : 0;
  }

  /**
   * Calculate total stock for a product at a branch
   */
  async calculateProductStockAtBranch(
    branchId: string,
    productId: string,
  ): Promise<number> {
    const result = await this.stockMovementModel.aggregate([
      {
        $match: {
          branchId: new Types.ObjectId(branchId),
          productId: new Types.ObjectId(productId),
        },
      },
      { $group: { _id: null, totalQuantity: { $sum: '$quantity' } } },
    ]);

    return result.length > 0 ? result[0].totalQuantity : 0;
  }

  /**
   * Get movement count for a batch
   */
  async countByBatch(batchId: string): Promise<number> {
    return this.stockMovementModel
      .countDocuments({ batchId: new Types.ObjectId(batchId) })
      .exec();
  }

  /**
   * Property 13: Stock movements are immutable
   * Note: No delete methods are exposed to enforce immutability
   * Stock movements serve as an audit trail and cannot be deleted
   */
}
