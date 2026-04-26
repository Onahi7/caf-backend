import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CurrentUserData } from '../auth/decorators/current-user.decorator.js';
import { User, UserRole } from '../users/schemas/user.schema.js';
import { Product } from '../products/schemas/product.schema.js';
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
  ) {}

  async createAssignment(dto: CreateMarketerAssignmentDto, actor: CurrentUserData) {
    this.ensureAdminOrManager(actor);

    if (actor.role === UserRole.BRANCH_MANAGER && actor.branchId !== dto.branchId) {
      throw new ForbiddenException('Branch managers can only assign products in their own branch');
    }

    const marketer = await this.userModel.findById(dto.marketerId).exec();
    if (!marketer || marketer.role !== UserRole.MARKETER) {
      throw new NotFoundException('Marketer user not found');
    }

    if (!marketer.branchId || marketer.branchId.toString() !== dto.branchId) {
      throw new BadRequestException('Marketer is not assigned to the selected branch');
    }

    const product = await this.productModel.findById(dto.productId).exec();
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    if (product.branchId.toString() !== dto.branchId) {
      throw new BadRequestException('Product does not belong to selected branch');
    }

    const existing = await this.assignmentModel
      .findOne({
        branchId: dto.branchId,
        marketerId: dto.marketerId,
        productId: dto.productId,
        isActive: true,
      })
      .exec();

    if (existing) {
      throw new BadRequestException('An active assignment already exists for this marketer and product');
    }

    const assignment = await this.assignmentModel.create({
      ...dto,
      assignedBy: actor.userId,
      remainingQuantity: dto.assignedQuantity,
      status: MarketerAssignmentStatus.PENDING,
    });

    return assignment;
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
        .populate('productId', 'name sku branchId')
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

    if (dto.assignedQuantity !== undefined) {
      const soldQuantity = assignment.assignedQuantity - assignment.remainingQuantity;
      if (dto.assignedQuantity < soldQuantity) {
        throw new BadRequestException('Assigned quantity cannot be lower than already sold quantity');
      }
      assignment.assignedQuantity = dto.assignedQuantity;
      assignment.remainingQuantity = dto.assignedQuantity - soldQuantity;
    }

    if (dto.assignedUnitPrice !== undefined) {
      assignment.assignedUnitPrice = dto.assignedUnitPrice;
    }

    if (dto.isActive !== undefined) {
      assignment.isActive = dto.isActive;
    }

    if (dto.notes !== undefined) {
      assignment.notes = dto.notes;
    }

    await assignment.save();
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

    assignment.remainingQuantity -= dto.quantity;
    await assignment.save();

    const unitPrice = assignment.assignedUnitPrice;
    const totalAmount = unitPrice * dto.quantity;

    return this.saleModel.create({
      branchId: assignment.branchId,
      marketerId: assignment.marketerId,
      assignmentId: assignment._id,
      productId: assignment.productId,
      quantity: dto.quantity,
      unitPrice,
      totalAmount,
      customerName: dto.customerName,
      customerPhone: dto.customerPhone,
      notes: dto.notes,
      soldAt: new Date(),
    });
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
        .populate('productId', 'name sku')
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
}
