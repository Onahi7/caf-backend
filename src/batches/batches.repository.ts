import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { Batch, BatchDocument } from './schemas/batch.schema.js';
import { CreateBatchDto } from './dto/create-batch.dto.js';
import { UpdateBatchDto } from './dto/update-batch.dto.js';

@Injectable()
export class BatchesRepository {
  constructor(
    @InjectModel(Batch.name) private batchModel: Model<BatchDocument>,
  ) {}

  async create(
    createBatchDto: CreateBatchDto,
    session?: ClientSession,
  ): Promise<BatchDocument> {
    const batch = new this.batchModel({
      ...createBatchDto,
      quantityAvailable: createBatchDto.quantity,
      quantityInitial: createBatchDto.quantity,
    });

    if (session) {
      return batch.save({ session });
    }
    return batch.save();
  }

  async findAll(): Promise<BatchDocument[]> {
    return this.batchModel.find().exec();
  }

  async findById(id: string): Promise<BatchDocument | null> {
    return this.batchModel.findById(id).exec();
  }

  async findByBranch(branchId: string): Promise<BatchDocument[]> {
    return this.batchModel.find({ branchId }).exec();
  }

  async findByProduct(productId: string): Promise<BatchDocument[]> {
    return this.batchModel.find({ productId }).exec();
  }

  async findByBranchAndProduct(
    branchId: string,
    productId: string,
  ): Promise<BatchDocument[]> {
    return this.batchModel
      .find({
        branchId: new Types.ObjectId(branchId),
        productId: new Types.ObjectId(productId),
      })
      .sort({ expiryDate: 1 }) // Sort by expiry date ascending (FEFO)
      .exec();
  }

  /**
   * Find available batches for FEFO selection
   * Excludes expired batches and depleted batches
   * Sorted by expiry date (earliest first)
   */
  async findAvailableForFEFO(
    branchId: string,
    productId: string,
  ): Promise<BatchDocument[]> {
    const now = new Date();
    return this.batchModel
      .find({
        branchId: new Types.ObjectId(branchId),
        productId: new Types.ObjectId(productId),
        quantityAvailable: { $gt: 0 },
        expiryDate: { $gt: now },
        isExpired: false,
        isDepleted: false,
      })
      .sort({ expiryDate: 1 }) // FEFO: earliest expiry first
      .exec();
  }

  async findExpiring(
    branchId: string,
    daysUntilExpiry: number,
  ): Promise<BatchDocument[]> {
    const now = new Date();
    const expiryThreshold = new Date();
    expiryThreshold.setDate(now.getDate() + daysUntilExpiry);

    return this.batchModel
      .find({
        branchId: new Types.ObjectId(branchId),
        expiryDate: { $gte: now, $lte: expiryThreshold },
        quantityAvailable: { $gt: 0 },
      })
      .sort({ expiryDate: 1 })
      .exec();
  }

  async findExpired(branchId?: string): Promise<BatchDocument[]> {
    const now = new Date();
    const filter: Record<string, unknown> = {
      expiryDate: { $lt: now },
      quantityAvailable: { $gt: 0 },
    };

    if (branchId) {
      filter.branchId = new Types.ObjectId(branchId);
    }

    return this.batchModel.find(filter).exec();
  }

  async update(
    id: string,
    updateBatchDto: UpdateBatchDto,
  ): Promise<BatchDocument | null> {
    return this.batchModel
      .findByIdAndUpdate(id, updateBatchDto, { new: true })
      .exec();
  }

  async updateQuantity(
    id: string,
    quantityChange: number,
    session?: ClientSession,
  ): Promise<BatchDocument | null> {
    // For deductions (quantityChange < 0) the filter enforces that enough stock
    // exists ATOMICALLY — no other write can slip in between the check and the
    // decrement because findOneAndUpdate is a single server-side operation.
    const filter: Record<string, unknown> = { _id: id };
    if (quantityChange < 0) {
      filter.quantityAvailable = { $gte: -quantityChange };
    }

    // Aggregation-pipeline update computes isDepleted from the new value in one
    // round-trip, eliminating the read-then-write race condition entirely.
    const result = await this.batchModel
      .findOneAndUpdate(
        filter,
        [
          {
            $set: {
              quantityAvailable: {
                $max: [0, { $add: ['$quantityAvailable', quantityChange] }],
              },
              isDepleted: {
                $lte: [{ $add: ['$quantityAvailable', quantityChange] }, 0],
              },
            },
          },
        ],
        {
          new: true,
          updatePipeline: true,
          ...(session ? { session } : {}),
        },
      )
      .exec();

    // null means the filter didn't match → insufficient stock for deductions
    if (!result && quantityChange < 0) {
      throw new BadRequestException(
        `Insufficient stock in batch ${id}: cannot deduct ${-quantityChange} units`,
      );
    }

    return result;
  }

  async markAsExpired(id: string): Promise<BatchDocument | null> {
    return this.batchModel
      .findByIdAndUpdate(id, { isExpired: true }, { new: true })
      .exec();
  }

  async markExpiredBatches(): Promise<number> {
    const now = new Date();
    const result = await this.batchModel
      .updateMany(
        { expiryDate: { $lt: now }, isExpired: false },
        { isExpired: true },
      )
      .exec();

    return result.modifiedCount;
  }

  async delete(id: string): Promise<BatchDocument | null> {
    return this.batchModel.findByIdAndDelete(id).exec();
  }

  async getTotalStockForProduct(
    productId: string,
    branchId: string,
    session?: ClientSession,
  ): Promise<number> {
    const result = await this.batchModel
      .aggregate([
        {
          $match: {
            productId: new Types.ObjectId(productId),
            branchId: new Types.ObjectId(branchId),
            isDepleted: false,
            isExpired: false,
          },
        },
        { $group: { _id: null, total: { $sum: '$quantityAvailable' } } },
      ])
      .session(session ?? null)
      .exec();
    return result[0]?.total ?? 0;
  }
}
