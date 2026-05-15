import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, ClientSession } from 'mongoose';
import {
  Transfer,
  TransferDocument,
  TransferStatus,
  TransferType,
} from './schemas/transfer.schema.js';
import { CreateTransferDto } from './dto/create-transfer.dto.js';
import { TransferFilterDto } from './dto/transfer-filter.dto.js';

/**
 * TransfersRepository
 * Data access layer for transfer operations
 * Requirements: 4.1, 4.3
 * Properties: 15, 17
 */
@Injectable()
export class TransfersRepository {
  constructor(
    @InjectModel(Transfer.name) private transferModel: Model<TransferDocument>,
  ) {}

  private populateReferences() {
    return this.transferModel
      .find()
      .populate('sourceBranchId')
      .populate('destinationBranchId')
      .populate('productId')
      .populate('requestedBy')
      .populate('approvedBy');
  }

  /**
   * Create a new transfer request
   * Property 15: Transfer structure completeness
   */
  async create(
    createTransferDto: CreateTransferDto,
    requestedBy: string,
    transferType: TransferType,
    session?: ClientSession,
  ): Promise<TransferDocument> {
    const transfer = new this.transferModel({
      sourceBranchId: new Types.ObjectId(createTransferDto.sourceBranchId),
      destinationBranchId: new Types.ObjectId(
        createTransferDto.destinationBranchId,
      ),
      productId: new Types.ObjectId(createTransferDto.productId),
      quantity: createTransferDto.quantity,
      reason: createTransferDto.reason,
      notes: createTransferDto.notes,
      status: TransferStatus.PENDING,
      transferType,
      requestedBy: new Types.ObjectId(requestedBy),
    });

    if (session) {
      return transfer.save({ session });
    }
    return transfer.save();
  }

  async findAll(): Promise<TransferDocument[]> {
    return this.populateReferences().sort({ createdAt: -1 }).exec();
  }

  async findById(id: string): Promise<TransferDocument | null> {
    return this.transferModel
      .findById(id)
      .populate('sourceBranchId')
      .populate('destinationBranchId')
      .populate('productId')
      .populate('requestedBy')
      .populate('approvedBy')
      .exec();
  }

  /**
   * Find transfers with filtering
   * Requirements: 10.4
   */
  async findWithFilter(filter: TransferFilterDto): Promise<TransferDocument[]> {
    const query: Record<string, unknown> = {};

    if (filter.sourceBranchId) {
      query.sourceBranchId = new Types.ObjectId(filter.sourceBranchId);
    }

    if (filter.destinationBranchId) {
      query.destinationBranchId = new Types.ObjectId(
        filter.destinationBranchId,
      );
    }

    // Filter by either source or destination branch
    if (filter.branchId) {
      const branchObjectId = new Types.ObjectId(filter.branchId);
      query.$or = [
        { sourceBranchId: branchObjectId },
        { destinationBranchId: branchObjectId },
      ];
    }

    if (filter.status) {
      query.status = filter.status;
    }

    if (filter.transferType) {
      query.transferType = filter.transferType;
    }

    if (filter.productId) {
      query.productId = new Types.ObjectId(filter.productId);
    }

    if (filter.startDate || filter.endDate) {
      query.createdAt = {};
      if (filter.startDate) {
        (query.createdAt as Record<string, unknown>).$gte = new Date(filter.startDate);
      }
      if (filter.endDate) {
        (query.createdAt as Record<string, unknown>).$lte = new Date(filter.endDate);
      }
    }

    return this.transferModel
      .find(query)
      .populate('sourceBranchId')
      .populate('destinationBranchId')
      .populate('productId')
      .populate('requestedBy')
      .populate('approvedBy')
      .sort({ createdAt: -1 })
      .exec();
  }

  /**
   * Find pending transfers
   * Requirements: 10.4
   * Property 43: Pending transfer visibility
   */
  async findPending(): Promise<TransferDocument[]> {
    return this.transferModel
      .find({ status: TransferStatus.PENDING })
      .populate('sourceBranchId')
      .populate('destinationBranchId')
      .populate('productId')
      .populate('requestedBy')
      .populate('approvedBy')
      .sort({ createdAt: -1 })
      .exec();
  }

  /**
   * Find pending transfers for a specific branch (as destination)
   */
  async findPendingForBranch(branchId: string): Promise<TransferDocument[]> {
    return this.transferModel
      .find({
        destinationBranchId: new Types.ObjectId(branchId),
        status: TransferStatus.PENDING,
      })
      .populate('sourceBranchId')
      .populate('destinationBranchId')
      .populate('productId')
      .populate('requestedBy')
      .populate('approvedBy')
      .sort({ createdAt: -1 })
      .exec();
  }

  /**
   * Find transfers by source branch
   */
  async findBySourceBranch(branchId: string): Promise<TransferDocument[]> {
    return this.transferModel
      .find({ sourceBranchId: new Types.ObjectId(branchId) })
      .sort({ createdAt: -1 })
      .exec();
  }

  /**
   * Find transfers by destination branch
   */
  async findByDestinationBranch(branchId: string): Promise<TransferDocument[]> {
    return this.transferModel
      .find({ destinationBranchId: new Types.ObjectId(branchId) })
      .sort({ createdAt: -1 })
      .exec();
  }

  /**
   * Update transfer status to approved
   * Property 18: Transfer approval workflow
   */
  async approve(
    id: string,
    approvedBy: string,
    notes?: string,
    session?: ClientSession,
  ): Promise<TransferDocument | null> {
    const updateData: Partial<TransferDocument> = {
      status: TransferStatus.APPROVED,
      approvedBy: new Types.ObjectId(approvedBy),
    };

    if (notes) {
      updateData.notes = notes;
    }

    const options: { new: boolean; session?: ClientSession } = { new: true };
    if (session) {
      options.session = session;
    }

    return this.transferModel.findByIdAndUpdate(id, updateData, options).exec();
  }

  /**
   * Update transfer status to rejected
   */
  async reject(
    id: string,
    approvedBy: string,
    rejectionReason: string,
    notes?: string,
    session?: ClientSession,
  ): Promise<TransferDocument | null> {
    const updateData: Partial<TransferDocument> = {
      status: TransferStatus.REJECTED,
      approvedBy: new Types.ObjectId(approvedBy),
      rejectionReason,
    };

    if (notes) {
      updateData.notes = notes;
    }

    const options: { new: boolean; session?: ClientSession } = { new: true };
    if (session) {
      options.session = session;
    }

    return this.transferModel.findByIdAndUpdate(id, updateData, options).exec();
  }

  /**
   * Mark transfer as completed
   * Property 16: Transfer atomicity (called within transaction)
   */
  async complete(
    id: string,
    session?: ClientSession,
  ): Promise<TransferDocument | null> {
    const options: { new: boolean; session?: ClientSession } = { new: true };
    if (session) {
      options.session = session;
    }

    return this.transferModel
      .findByIdAndUpdate(
        id,
        {
          status: TransferStatus.COMPLETED,
          completedAt: new Date(),
        },
        options,
      )
      .exec();
  }

  /**
   * Count transfers by status
   */
  async countByStatus(status: TransferStatus): Promise<number> {
    return this.transferModel.countDocuments({ status }).exec();
  }

  /**
   * Count pending transfers for a branch
   */
  async countPendingForBranch(branchId: string): Promise<number> {
    return this.transferModel
      .countDocuments({
        destinationBranchId: new Types.ObjectId(branchId),
        status: TransferStatus.PENDING,
      })
      .exec();
  }
}
