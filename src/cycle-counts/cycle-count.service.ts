import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { CycleCountRepository } from './cycle-count.repository.js';
import {
  CycleCountDocument,
  CycleCountStatus,
} from './schemas/cycle-count.schema.js';
import { CreateCycleCountDto } from './dto/create-cycle-count.dto.js';
import { SubmitCycleCountDto } from './dto/submit-cycle-count.dto.js';
import { Product, ProductDocument } from '../products/schemas/product.schema.js';
import { StockMovementRepository } from '../inventory/stock-movement.repository.js';
import { MovementType } from '../inventory/schemas/stock-movement.schema.js';

@Injectable()
export class CycleCountService {
  constructor(
    private readonly repo: CycleCountRepository,
    private readonly stockMovementRepo: StockMovementRepository,
    @InjectModel(Product.name) private readonly productModel: Model<ProductDocument>,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  /**
   * Create a new draft cycle count for a branch.
   * Snapshots all active products. Stock is counted at product total level.
   */
  async create(
    dto: CreateCycleCountDto,
    userId: string,
  ): Promise<CycleCountDocument> {
    // Only one draft allowed per branch at a time
    const existing = await this.repo.findActiveDraftForBranch(dto.branchId);
    if (existing) {
      throw new ConflictException(
        'A draft cycle count already exists for this branch. Submit or cancel it first.',
      );
    }

    // Snapshot current stock
    const products = await this.productModel
      .find({
        branchId: new Types.ObjectId(dto.branchId),
        isActive: true,
      })
      .exec();

    const lines = products.map((product) => ({
      productId: product._id as Types.ObjectId,
      batchId: product._id as Types.ObjectId,
      lotNumber: 'Product total',
      systemQuantity: product.quantityAvailable,
      countedQuantity: null,
      variance: null,
    }));

    return this.repo.create({
      branchId: new Types.ObjectId(dto.branchId),
      createdBy: new Types.ObjectId(userId),
      status: CycleCountStatus.DRAFT,
      notes: dto.notes,
      lines,
    });
  }

  async findAll(
    branchId: string,
    status?: CycleCountStatus,
  ): Promise<CycleCountDocument[]> {
    return this.repo.findByBranch(branchId, status);
  }

  async findOne(id: string): Promise<CycleCountDocument> {
    const doc = await this.repo.findById(id);
    if (!doc) throw new NotFoundException(`Cycle count ${id} not found`);
    return doc;
  }

  /**
   * Submit counted quantities for each product line.
   * Computes variances. Transitions status to SUBMITTED.
   */
  async submit(
    id: string,
    dto: SubmitCycleCountDto,
  ): Promise<CycleCountDocument> {
    const count = await this.findOne(id);
    if (count.status !== CycleCountStatus.DRAFT) {
      throw new BadRequestException('Only draft cycle counts can be submitted');
    }

    const countedMap = new Map(
      dto.lines.map((l) => [l.batchId, l.countedQuantity]),
    );

    const updatedLines = count.lines.map((line) => {
      const counted = countedMap.get(line.batchId.toString());
      const countedQty = counted !== undefined ? counted : line.countedQuantity;
      return {
        ...line,
        countedQuantity: countedQty,
        variance:
          countedQty !== null ? countedQty - line.systemQuantity : null,
      };
    });

    const updated = await this.repo.updateLines(id, updatedLines as CycleCountDocument['lines']);
    if (!updated) throw new NotFoundException(`Cycle count ${id} not found`);
    return updated;
  }

  /**
   * Approve the cycle count.
   * For every line with a non-zero variance, creates an ADJUSTMENT stock
   * movement and updates product total stock atomically inside a transaction.
   */
  async approve(id: string, userId: string): Promise<CycleCountDocument> {
    const count = await this.findOne(id);
    if (count.status !== CycleCountStatus.SUBMITTED) {
      throw new BadRequestException(
        'Only submitted cycle counts can be approved',
      );
    }

    const uncounted = count.lines.filter((l) => l.countedQuantity === null);
    if (uncounted.length > 0) {
      throw new BadRequestException(
        `${uncounted.length} line(s) have not been counted yet`,
      );
    }

    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      for (const line of count.lines) {
        const variance = line.variance ?? 0;
        if (variance === 0) continue;

        // Atomically update product total quantity.
        await this.productModel
          .findByIdAndUpdate(
            line.productId,
            [
              {
                $set: {
                  quantityAvailable: {
                    $max: [0, { $add: ['$quantityAvailable', variance] }],
                  },
                },
              },
            ],
            { session, new: true },
          )
          .exec();

        // Record ADJUSTMENT movement for audit trail
        await this.stockMovementRepo.create(
          {
            branchId: count.branchId.toString(),
            productId: line.productId.toString(),
            quantity: variance,
            movementType: MovementType.ADJUSTMENT,
            reason: `Cycle count adjustment (count ID: ${id})`,
            userId,
            referenceId: id,
            referenceType: 'CycleCount',
            metadata: {
              systemQuantity: line.systemQuantity,
              countedQuantity: line.countedQuantity,
              variance,
            },
          },
          session,
        );
      }

      await this.repo.updateStatus(
        id,
        CycleCountStatus.APPROVED,
        { approvedBy: new Types.ObjectId(userId) } as Partial<CycleCountDocument>,
        session,
      );

      await session.commitTransaction();
      return this.findOne(id);
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }
  }

  async cancel(id: string): Promise<CycleCountDocument> {
    const count = await this.findOne(id);
    if (
      count.status === CycleCountStatus.APPROVED ||
      count.status === CycleCountStatus.CANCELLED
    ) {
      throw new BadRequestException(
        'Cannot cancel an approved or already cancelled cycle count',
      );
    }
    const updated = await this.repo.updateStatus(id, CycleCountStatus.CANCELLED);
    if (!updated) throw new NotFoundException(`Cycle count ${id} not found`);
    return updated;
  }
}
