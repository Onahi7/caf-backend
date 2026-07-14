import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { CurrentUserData } from '../auth/decorators/current-user.decorator.js';
import { User, UserRole } from '../users/schemas/user.schema.js';
import { Product } from '../products/schemas/product.schema.js';
import { StockMovement, StockMovementDocument, MovementType } from '../inventory/schemas/stock-movement.schema.js';
import { Batch, BatchDocument } from '../batches/schemas/batch.schema.js';
import {
  MarketerProductAssignment,
  MarketerAssignmentStatus,
  MarketerProductAssignmentDocument,
} from './schemas/marketer-product-assignment.schema.js';
import { MarketerSale, MarketerSaleDocument } from './schemas/marketer-sale.schema.js';
import { CreateMarketerAssignmentDto } from './dto/create-marketer-assignment.dto.js';
import { UpdateMarketerAssignmentDto } from './dto/update-marketer-assignment.dto.js';
import { CreateMarketerSaleDto } from './dto/create-marketer-sale.dto.js';
import { MarketerAssignmentQueryDto, MarketerSalesQueryDto } from './dto/marketer-query.dto.js';

@Injectable()
export class MarketerService {
  constructor(
    @InjectModel(MarketerProductAssignment.name)
    private readonly assignmentModel: Model<MarketerProductAssignmentDocument>,
    @InjectModel(MarketerSale.name)
    private readonly saleModel: Model<MarketerSaleDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<User>,
    @InjectModel(Product.name)
    private readonly productModel: Model<Product>,
    @InjectModel(StockMovement.name)
    private readonly stockMovementModel: Model<StockMovementDocument>,
    @InjectModel(Batch.name)
    private readonly batchModel: Model<BatchDocument>,
    @InjectConnection()
    private readonly connection: Connection,
  ) {}

  async createAssignment(dto: CreateMarketerAssignmentDto, actor: CurrentUserData) {
    this.ensureAdminOrManager(actor);

    if (actor.role === UserRole.BRANCH_MANAGER && actor.branchId !== dto.branchId) {
      throw new ForbiddenException('Branch managers can only assign products in their own branch');
    }

    const items = this.normalizeAssignmentItems(dto);
    const duplicateProduct = items.find((item, index) =>
      items.some((other, otherIndex) => otherIndex !== index && other.productId === item.productId),
    );
    if (duplicateProduct) {
      throw new BadRequestException('Each product can only appear once in the same assignment request');
    }

    const marketer = await this.userModel.findById(dto.marketerId).exec();
    if (!marketer || marketer.role !== UserRole.MARKETER) {
      throw new NotFoundException('Marketer user not found');
    }

    if (!marketer.branchId || marketer.branchId.toString() !== dto.branchId) {
      throw new BadRequestException('Marketer is not assigned to the selected branch');
    }

    const session = await this.connection.startSession();
    const assignments: MarketerProductAssignmentDocument[] = [];
    try {
      await session.withTransaction(async () => {
        for (const item of items) {
          const product = await this.productModel
            .findOne({
              _id: new Types.ObjectId(item.productId),
              branchId: new Types.ObjectId(dto.branchId),
            })
            .session(session)
            .exec();
          if (!product) {
            throw new NotFoundException('Product not found in selected branch');
          }

          const existing = await this.assignmentModel
            .findOne({
              branchId: dto.branchId,
              marketerId: dto.marketerId,
              productId: item.productId,
              isActive: true,
            })
            .session(session)
            .exec();

          if (existing) {
            throw new BadRequestException(`An active assignment already exists for ${product.name}`);
          }

          const updatedProduct = await this.productModel.findOneAndUpdate(
            {
              _id: new Types.ObjectId(item.productId),
              branchId: new Types.ObjectId(dto.branchId),
              quantityAvailable: { $gte: item.assignedQuantity },
            },
            { $inc: { quantityAvailable: -item.assignedQuantity } },
            { new: true, session },
          ).exec();

          if (!updatedProduct) {
            throw new BadRequestException(
              `Insufficient stock to assign ${item.assignedQuantity} units of ${product.name}`,
            );
          }

          const batchAllocations = await this.allocateBatches(
            dto.branchId,
            item.productId,
            item.assignedQuantity,
            session,
          );

          const [assignment] = await this.assignmentModel.create([{
            branchId: dto.branchId,
            marketerId: dto.marketerId,
            productId: item.productId,
            assignedQuantity: item.assignedQuantity,
            assignedUnitPrice: item.assignedUnitPrice,
            notes: dto.notes,
            assignedBy: actor.userId,
            remainingQuantity: item.assignedQuantity,
            batchAllocations,
            status: MarketerAssignmentStatus.PENDING,
          }], { session });

          assignments.push(assignment);

          await this.recordMarketerStockMovement({
            branchId: dto.branchId,
            productId: item.productId,
            quantity: -item.assignedQuantity,
            userId: actor.userId,
            referenceId: assignment._id,
            reason: 'Stock assigned to marketer',
            metadata: { marketerId: dto.marketerId },
          }, session);
        }
      });
    } finally {
      await session.endSession();
    }

    return dto.items?.length ? assignments : assignments[0];
  }

  private normalizeAssignmentItems(dto: CreateMarketerAssignmentDto) {
    if (dto.items?.length) {
      return dto.items;
    }

    if (
      dto.productId &&
      dto.assignedQuantity !== undefined &&
      dto.assignedUnitPrice !== undefined
    ) {
      return [{
        productId: dto.productId,
        assignedQuantity: dto.assignedQuantity,
        assignedUnitPrice: dto.assignedUnitPrice,
      }];
    }

    throw new BadRequestException('Add at least one product assignment');
  }

  async listAssignments(filter: MarketerAssignmentQueryDto, actor: CurrentUserData) {
    const query: Record<string, unknown> = {};

    if (actor.role === UserRole.MARKETER) {
      query.marketerId = actor.userId;
      if (!actor.branchId) {
        throw new ForbiddenException('Marketer is not assigned to a branch');
      }
      query.branchId = actor.branchId;
    } else if (actor.role === UserRole.BRANCH_MANAGER) {
      if (!actor.branchId) {
        throw new ForbiddenException('Branch manager is not assigned to a branch');
      }
      if (filter.branchId && filter.branchId !== actor.branchId) {
        throw new ForbiddenException('You can only view assignments in your branch');
      }
      query.branchId = actor.branchId;
    }

    if (filter.branchId && actor.role === UserRole.SUPER_ADMIN) {
      query.branchId = filter.branchId;
    }

    if (filter.marketerId && actor.role !== UserRole.MARKETER) {
      query.marketerId = filter.marketerId;
    }

    if (filter.productId) {
      query.productId = filter.productId;
    }

    if (filter.status) {
      query.status = filter.status;
    }

    if (filter.activeOnly !== false) {
      query.isActive = true;
    }

    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.assignmentModel
        .find(query)
        .populate('marketerId', 'firstName lastName username branchId')
        .populate('productId', 'name sku brand branchId')
        .populate('branchId', 'name code')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.assignmentModel.countDocuments(query).exec(),
    ]);

    return {
      data,
      total,
      page,
      limit,
    };
  }

  async acceptAssignment(id: string, actor: CurrentUserData) {
    if (actor.role !== UserRole.MARKETER) {
      throw new ForbiddenException('Only marketer can accept assignment');
    }

    const assignment = await this.assignmentModel.findById(id).exec();
    if (!assignment || !assignment.isActive) {
      throw new NotFoundException('Active assignment not found');
    }

    if (assignment.marketerId.toString() !== actor.userId) {
      throw new ForbiddenException('You can only accept your own assignments');
    }

    if (assignment.status !== MarketerAssignmentStatus.PENDING) {
      throw new BadRequestException('Only pending assignments can be accepted');
    }

    assignment.status = MarketerAssignmentStatus.ACCEPTED;
    assignment.reviewedAt = new Date();
    assignment.reviewedBy = new Types.ObjectId(actor.userId);

    await assignment.save();
    return assignment;
  }

  async updateAssignment(id: string, dto: UpdateMarketerAssignmentDto, actor: CurrentUserData) {
    this.ensureAdminOrManager(actor);

    const assignment = await this.assignmentModel.findById(id).exec();
    if (!assignment) {
      throw new NotFoundException('Assignment not found');
    }

    if (
      actor.role === UserRole.BRANCH_MANAGER &&
      actor.branchId !== assignment.branchId.toString()
    ) {
      throw new ForbiddenException('You can only update assignments in your branch');
    }

    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        if (dto.assignedQuantity !== undefined) {
      const soldQuantity = assignment.assignedQuantity - assignment.remainingQuantity;
      if (dto.assignedQuantity < soldQuantity) {
        throw new BadRequestException('Assigned quantity cannot be lower than already sold quantity');
      }
      const quantityDelta = dto.assignedQuantity - assignment.assignedQuantity;
      if (quantityDelta > 0) {
        const updatedProduct = await this.productModel.findOneAndUpdate(
          {
            _id: assignment.productId,
            branchId: assignment.branchId,
            quantityAvailable: { $gte: quantityDelta },
          },
          { $inc: { quantityAvailable: -quantityDelta } },
          { new: true, session },
        ).exec();

        if (!updatedProduct) {
          throw new BadRequestException(`Insufficient branch stock to increase assignment by ${quantityDelta} units`);
        }

        const addedAllocations = await this.allocateBatches(
          assignment.branchId.toString(),
          assignment.productId.toString(),
          quantityDelta,
          session,
        );
        assignment.batchAllocations.push(...addedAllocations);

        await this.recordMarketerStockMovement({
          branchId: assignment.branchId.toString(),
          productId: assignment.productId.toString(),
          quantity: -quantityDelta,
          userId: actor.userId,
          referenceId: assignment._id,
          reason: 'Marketer assignment increased',
          metadata: { marketerId: assignment.marketerId.toString() },
        }, session);
      } else if (quantityDelta < 0) {
        const returnQuantity = Math.abs(quantityDelta);
        await this.returnAllocatedBatches(assignment, returnQuantity, session);
        await this.productModel.updateOne(
          { _id: assignment.productId, branchId: assignment.branchId },
          { $inc: { quantityAvailable: returnQuantity } },
          { session },
        ).exec();

        await this.recordMarketerStockMovement({
          branchId: assignment.branchId.toString(),
          productId: assignment.productId.toString(),
          quantity: returnQuantity,
          userId: actor.userId,
          referenceId: assignment._id,
          reason: 'Marketer assignment reduced',
          metadata: { marketerId: assignment.marketerId.toString() },
        }, session);
      }
      assignment.assignedQuantity = dto.assignedQuantity;
      assignment.remainingQuantity = dto.assignedQuantity - soldQuantity;
        }

        if (dto.assignedUnitPrice !== undefined) {
          assignment.assignedUnitPrice = dto.assignedUnitPrice;
        }

        if (dto.isActive !== undefined && dto.isActive !== assignment.isActive) {
          if (!dto.isActive && assignment.remainingQuantity > 0) {
            await this.returnAllocatedBatches(assignment, assignment.remainingQuantity, session);
            await this.productModel.updateOne(
              { _id: assignment.productId, branchId: assignment.branchId },
              { $inc: { quantityAvailable: assignment.remainingQuantity } },
              { session },
            ).exec();

            await this.recordMarketerStockMovement({
              branchId: assignment.branchId.toString(),
              productId: assignment.productId.toString(),
              quantity: assignment.remainingQuantity,
              userId: actor.userId,
              referenceId: assignment._id,
              reason: 'Unsold marketer stock returned',
              metadata: { marketerId: assignment.marketerId.toString() },
            }, session);

            assignment.remainingQuantity = 0;
          }
          assignment.isActive = dto.isActive;
        }

        if (dto.notes !== undefined) {
          assignment.notes = dto.notes;
        }

        await assignment.save({ session });
      });
    } finally {
      await session.endSession();
    }
    return assignment;
  }

  async createSale(dto: CreateMarketerSaleDto, actor: CurrentUserData) {
    this.ensureMarketerFlowActor(actor);

    const assignment = await this.assignmentModel.findById(dto.assignmentId).exec();
    if (!assignment || !assignment.isActive) {
      throw new NotFoundException('Active assignment not found');
    }

    if (assignment.status !== MarketerAssignmentStatus.ACCEPTED) {
      throw new BadRequestException('Assignment must be accepted before recording sales');
    }

    if (actor.role === UserRole.MARKETER) {
      if (assignment.marketerId.toString() !== actor.userId) {
        throw new ForbiddenException('You can only sell your assigned products');
      }
      if (!actor.branchId || assignment.branchId.toString() !== actor.branchId) {
        throw new ForbiddenException('Assignment does not belong to your branch');
      }
    }

    if (dto.quantity > assignment.remainingQuantity) {
      throw new BadRequestException(
        `Insufficient assigned stock. Requested ${dto.quantity}, available ${assignment.remainingQuantity}`,
      );
    }

    const unitPrice = assignment.assignedUnitPrice;
    const totalAmount = unitPrice * dto.quantity;
    const session = await this.connection.startSession();
    let sale: MarketerSaleDocument | undefined;
    try {
      await session.withTransaction(async () => {
        this.consumeAllocatedBatches(assignment, dto.quantity);
        assignment.remainingQuantity -= dto.quantity;
        await assignment.save({ session });
        [sale] = await this.saleModel.create([{
          branchId: assignment.branchId,
          marketerId: assignment.marketerId,
          assignmentId: assignment._id,
          productId: assignment.productId,
          quantity: dto.quantity,
          unitPrice,
          totalAmount,
          customerName: dto.customerName,
          customerPhone: dto.customerPhone,
          customerId: dto.customerId ? new Types.ObjectId(dto.customerId) : undefined,
          notes: dto.notes,
          soldAt: new Date(),
        }], { session });
      });
    } finally {
      await session.endSession();
    }
    return sale!;
  }

  async listSales(filter: MarketerSalesQueryDto, actor: CurrentUserData) {
    const query: Record<string, unknown> = {};

    if (actor.role === UserRole.MARKETER) {
      query.marketerId = actor.userId;
      if (!actor.branchId) {
        throw new ForbiddenException('Marketer is not assigned to a branch');
      }
      query.branchId = actor.branchId;
    } else if (actor.role === UserRole.BRANCH_MANAGER) {
      if (!actor.branchId) {
        throw new ForbiddenException('Branch manager is not assigned to a branch');
      }
      query.branchId = actor.branchId;
      if (filter.branchId && filter.branchId !== actor.branchId) {
        throw new ForbiddenException('You can only view sales in your branch');
      }
    }

    if (actor.role === UserRole.SUPER_ADMIN && filter.branchId) {
      query.branchId = filter.branchId;
    }

    if (filter.marketerId && actor.role !== UserRole.MARKETER) {
      query.marketerId = filter.marketerId;
    }

    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.saleModel
        .find(query)
        .populate('productId', 'name sku brand')
        .populate('marketerId', 'firstName lastName username')
        .sort({ soldAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.saleModel.countDocuments(query).exec(),
    ]);

    return {
      data,
      total,
      page,
      limit,
    };
  }

  async getSummary(filter: MarketerSalesQueryDto, actor: CurrentUserData) {
    const assignmentScope = this.buildScopedMatch(filter, actor);
    const assignmentAcceptedMatch = {
      ...assignmentScope,
      status: MarketerAssignmentStatus.ACCEPTED,
      isActive: true,
    };
    const assignmentPendingMatch = {
      ...assignmentScope,
      status: MarketerAssignmentStatus.PENDING,
      isActive: true,
    };
    const salesMatch = this.buildScopedMatch(filter, actor);

    const [assignmentAgg, pendingAssignmentAgg, salesAgg] = await Promise.all([
      this.assignmentModel
        .aggregate([
          { $match: assignmentAcceptedMatch },
          {
            $group: {
              _id: null,
              unitsAssigned: { $sum: '$assignedQuantity' },
              unitsRemaining: { $sum: '$remainingQuantity' },
              assignedStockValue: {
                $sum: { $multiply: ['$assignedQuantity', '$assignedUnitPrice'] },
              },
            },
          },
        ])
        .exec(),
      this.assignmentModel
        .aggregate([
          { $match: assignmentPendingMatch },
          {
            $group: {
              _id: null,
              pendingUnits: { $sum: '$assignedQuantity' },
              pendingStockValue: {
                $sum: { $multiply: ['$assignedQuantity', '$assignedUnitPrice'] },
              },
            },
          },
        ])
        .exec(),
      this.saleModel
        .aggregate([
          { $match: salesMatch },
          {
            $group: {
              _id: null,
              soldValue: { $sum: '$totalAmount' },
              unitsSold: { $sum: '$quantity' },
              saleCount: { $sum: 1 },
            },
          },
        ])
        .exec(),
    ]);

    const assignmentData = assignmentAgg[0] || {
      unitsAssigned: 0,
      unitsRemaining: 0,
      assignedStockValue: 0,
    };
    const salesData = salesAgg[0] || {
      soldValue: 0,
      unitsSold: 0,
      saleCount: 0,
    };
    const pendingData = pendingAssignmentAgg[0] || {
      pendingUnits: 0,
      pendingStockValue: 0,
    };

    return {
      assignedStockValue: assignmentData.assignedStockValue,
      unitsAssigned: assignmentData.unitsAssigned,
      unitsRemaining: assignmentData.unitsRemaining,
      pendingStockValue: pendingData.pendingStockValue,
      pendingUnits: pendingData.pendingUnits,
      soldValue: salesData.soldValue,
      unitsSold: salesData.unitsSold,
      saleCount: salesData.saleCount,
    };
  }

  private buildScopedMatch(filter: MarketerSalesQueryDto, actor: CurrentUserData) {
    const query: Record<string, unknown> = {};

    if (actor.role === UserRole.MARKETER) {
      query.marketerId = new Types.ObjectId(actor.userId);
      if (!actor.branchId) {
        throw new ForbiddenException('Marketer is not assigned to a branch');
      }
      query.branchId = new Types.ObjectId(actor.branchId);
      return query;
    }

    if (actor.role === UserRole.BRANCH_MANAGER) {
      if (!actor.branchId) {
        throw new ForbiddenException('Branch manager is not assigned to a branch');
      }
      query.branchId = new Types.ObjectId(actor.branchId);
      if (filter.branchId && filter.branchId !== actor.branchId) {
        throw new ForbiddenException('You can only view records in your branch');
      }
    } else if (filter.branchId) {
      query.branchId = new Types.ObjectId(filter.branchId);
    }

    if (filter.marketerId) {
      query.marketerId = new Types.ObjectId(filter.marketerId);
    }

    return query;
  }

  private ensureAdminOrManager(actor: CurrentUserData) {
    if (actor.role !== UserRole.SUPER_ADMIN && actor.role !== UserRole.BRANCH_MANAGER) {
      throw new ForbiddenException('Only admin or branch manager can manage assignments');
    }
  }

  private ensureMarketerFlowActor(actor: CurrentUserData) {
    if (
      actor.role !== UserRole.MARKETER &&
      actor.role !== UserRole.SUPER_ADMIN &&
      actor.role !== UserRole.BRANCH_MANAGER
    ) {
      throw new ForbiddenException('Not allowed to record marketer sales');
    }
  }

  private async recordMarketerStockMovement(
    dto: {
      branchId: string;
      productId: string;
      quantity: number;
      userId: string;
      referenceId: Types.ObjectId;
      reason: string;
      metadata?: Record<string, any>;
    },
    session: any,
  ) {
    await this.stockMovementModel.create([{
      branchId: new Types.ObjectId(dto.branchId),
      productId: new Types.ObjectId(dto.productId),
      quantity: dto.quantity,
      movementType: MovementType.TRANSFER,
      reason: dto.reason,
      userId: new Types.ObjectId(dto.userId),
      referenceId: dto.referenceId,
      referenceType: 'MarketerProductAssignment',
      timestamp: new Date(),
      metadata: dto.metadata,
    }], { session });
  }

  private async allocateBatches(
    branchId: string,
    productId: string,
    quantity: number,
    session: any,
  ) {
    const batches = await this.batchModel.find({
      branchId: new Types.ObjectId(branchId),
      productId: new Types.ObjectId(productId),
      quantityAvailable: { $gt: 0 },
      isExpired: false,
      isDepleted: false,
      expiryDate: { $gt: new Date() },
    }).sort({ expiryDate: 1 }).session(session).exec();
    let remaining = quantity;
    const allocations: Array<{ batchId: Types.ObjectId; quantity: number; remainingQuantity: number }> = [];
    for (const batch of batches) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, batch.quantityAvailable);
      const updated = await this.batchModel.findOneAndUpdate(
        { _id: batch._id, quantityAvailable: { $gte: take } },
        { $inc: { quantityAvailable: -take } },
        { new: true, session },
      ).exec();
      if (!updated) throw new BadRequestException('Batch stock changed while assigning stock');
      if (updated.quantityAvailable === 0) {
        await this.batchModel.updateOne({ _id: updated._id }, { $set: { isDepleted: true } }, { session }).exec();
      }
      allocations.push({ batchId: batch._id, quantity: take, remainingQuantity: take });
      remaining -= take;
    }
    if (remaining > 0) {
      throw new BadRequestException(`Insufficient unexpired batch stock. Missing ${remaining} units`);
    }
    return allocations;
  }

  private async returnAllocatedBatches(
    assignment: MarketerProductAssignmentDocument,
    quantity: number,
    session: any,
  ) {
    if (!assignment.batchAllocations?.length) {
      throw new BadRequestException('Legacy assignment has no batch allocation; run operational reconciliation first');
    }
    let remaining = quantity;
    for (const allocation of [...assignment.batchAllocations].reverse()) {
      if (remaining <= 0) break;
      const giveBack = Math.min(remaining, allocation.remainingQuantity);
      if (giveBack <= 0) continue;
      await this.batchModel.updateOne(
        { _id: allocation.batchId },
        { $inc: { quantityAvailable: giveBack }, $set: { isDepleted: false } },
        { session },
      ).exec();
      allocation.remainingQuantity -= giveBack;
      remaining -= giveBack;
    }
    if (remaining > 0) throw new BadRequestException('Assignment batch balance is inconsistent');
  }

  private consumeAllocatedBatches(
    assignment: MarketerProductAssignmentDocument,
    quantity: number,
  ) {
    if (!assignment.batchAllocations?.length) {
      throw new BadRequestException('Legacy assignment has no batch allocation; run operational reconciliation first');
    }
    let remaining = quantity;
    for (const allocation of assignment.batchAllocations) {
      if (remaining <= 0) break;
      const used = Math.min(remaining, allocation.remainingQuantity);
      allocation.remainingQuantity -= used;
      remaining -= used;
    }
    if (remaining > 0) throw new BadRequestException('Assignment batch balance is inconsistent');
  }
}
