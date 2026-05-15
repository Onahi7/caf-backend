import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { TransfersRepository } from './transfers.repository.js';
import { BranchesRepository } from '../branches/branches.repository.js';
import { InventoryService } from '../inventory/inventory.service.js';
import { CreateTransferDto } from './dto/create-transfer.dto.js';
import {
  ApproveTransferDto,
  RejectTransferDto,
} from './dto/approve-transfer.dto.js';
import { TransferFilterDto } from './dto/transfer-filter.dto.js';
import {
  TransferDocument,
  TransferStatus,
  TransferType,
} from './schemas/transfer.schema.js';
import { Product, ProductDocument } from '../products/schemas/product.schema.js';

/**
 * TransfersService
 * Business logic for inter-branch transfers with approval workflow
 * Requirements: 4.1, 4.2, 4.5
 * Properties: 15, 16, 17, 18
 */
@Injectable()
export class TransfersService {
  constructor(
    private readonly transfersRepository: TransfersRepository,
    private readonly branchesRepository: BranchesRepository,
    private readonly inventoryService: InventoryService,
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Product.name) private readonly productModel: Model<ProductDocument>,
  ) {}

  /**
   * Create a transfer request
   * Requirements: 4.1
   * Property 15: Transfer structure completeness
   * Property 17: Transfer type support
   */
  async createTransferRequest(
    dto: CreateTransferDto,
    requestedBy: string,
  ): Promise<TransferDocument> {
    // Validate source and destination branches exist
    const [sourceBranch, destinationBranch] = await Promise.all([
      this.branchesRepository.findById(dto.sourceBranchId),
      this.branchesRepository.findById(dto.destinationBranchId),
    ]);

    if (!sourceBranch) {
      throw new NotFoundException(
        `Source branch ${dto.sourceBranchId} not found`,
      );
    }

    if (!destinationBranch) {
      throw new NotFoundException(
        `Destination branch ${dto.destinationBranchId} not found`,
      );
    }

    if (dto.sourceBranchId === dto.destinationBranchId) {
      throw new BadRequestException(
        'Source and destination branches must be different',
      );
    }

    const product = await this.productModel.findById(dto.productId).exec();
    if (!product) {
      throw new NotFoundException(`Product ${dto.productId} not found`);
    }

    if (product.branchId.toString() !== dto.sourceBranchId) {
      throw new BadRequestException(
        'Product does not belong to the source branch',
      );
    }

    // Validate sufficient quantity
    if (product.quantityAvailable < dto.quantity) {
      throw new BadRequestException(
        `Insufficient quantity. Available: ${product.quantityAvailable}, Requested: ${dto.quantity}`,
      );
    }

    // Determine transfer type
    const transferType = this.determineTransferType(
      sourceBranch,
      destinationBranch,
    );

    return this.transfersRepository.create(dto, requestedBy, transferType);
  }

  /**
   * Determine transfer type based on source and destination branches
   * Property 17: Transfer type support
   */
  private determineTransferType(
    sourceBranch: { isHeadquarters: boolean },
    destinationBranch: { isHeadquarters: boolean },
  ): TransferType {
    // HQ is treated as the main outlet in current operational model.
    // Keep transfer classification uniform for simpler reporting and workflows.
    if (sourceBranch.isHeadquarters || destinationBranch.isHeadquarters) {
      return TransferType.OUTLET_TO_OUTLET;
    }
    return TransferType.OUTLET_TO_OUTLET;
  }

  /**
   * Get all transfers with optional filtering
   */
  async findAll(filter?: TransferFilterDto): Promise<TransferDocument[]> {
    if (filter && Object.keys(filter).length > 0) {
      return this.transfersRepository.findWithFilter(filter);
    }
    return this.transfersRepository.findAll();
  }

  /**
   * Get a transfer by ID
   */
  async findById(id: string): Promise<TransferDocument> {
    const transfer = await this.transfersRepository.findById(id);
    if (!transfer) {
      throw new NotFoundException(`Transfer ${id} not found`);
    }
    return transfer;
  }

  /**
   * Get pending transfers
   * Requirements: 10.4
   * Property 43: Pending transfer visibility
   */
  async findPending(): Promise<TransferDocument[]> {
    return this.transfersRepository.findPending();
  }

  /**
   * Get pending transfers for a specific branch
   */
  async findPendingForBranch(branchId: string): Promise<TransferDocument[]> {
    return this.transfersRepository.findPendingForBranch(branchId);
  }

  /**
   * Approve and execute a transfer
   * Requirements: 4.2, 4.5
   * Property 16: Transfer atomicity
   * Property 18: Transfer approval workflow
   */
  async approveTransfer(
    transferId: string,
    approvedBy: string,
    dto: ApproveTransferDto,
  ): Promise<TransferDocument> {
    const transfer = await this.findById(transferId);

    // Validate transfer is pending
    if (transfer.status !== TransferStatus.PENDING) {
      throw new BadRequestException(
        `Transfer is not pending. Current status: ${transfer.status}`,
      );
    }

    const sourceProduct = await this.productModel
      .findById(transfer.productId)
      .exec();
    if (!sourceProduct) {
      throw new NotFoundException('Transfer product no longer exists');
    }

    if (sourceProduct.quantityAvailable < transfer.quantity) {
      throw new BadRequestException(
        `Insufficient quantity in product stock. Available: ${sourceProduct.quantityAvailable}, Required: ${transfer.quantity}`,
      );
    }

    const destinationProduct = await this.productModel
      .findOne({
        branchId: transfer.destinationBranchId,
        sku: sourceProduct.sku,
      })
      .exec();
    if (!destinationProduct) {
      throw new NotFoundException(
        `Matching product with SKU ${sourceProduct.sku} not found in destination branch`,
      );
    }

    // Execute transfer within a transaction
    // Property 16: Transfer atomicity
    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      // 1. Approve the transfer
      await this.transfersRepository.approve(
        transferId,
        approvedBy,
        dto.notes,
        session,
      );

      const updatedSource = await this.productModel
        .findOneAndUpdate(
          {
            _id: new Types.ObjectId(sourceProduct._id),
            quantityAvailable: { $gte: transfer.quantity },
          },
          { $inc: { quantityAvailable: -transfer.quantity } },
          { new: true, session },
        )
        .exec();

      if (!updatedSource) {
        throw new BadRequestException(
          `Insufficient quantity in product stock. Available stock changed before approval.`,
        );
      }

      // 3. Create stock movement for source (transfer out)
      await this.inventoryService.recordTransferMovement(
        transfer.sourceBranchId.toString(),
        transfer.productId.toString(),
        transfer.quantity,
        approvedBy,
        transferId,
        true, // isSource
        session,
      );

      await this.productModel
        .findByIdAndUpdate(
          destinationProduct._id,
          {
            $inc: { quantityAvailable: transfer.quantity },
            $set: {
              costPrice: sourceProduct.costPrice,
              suggestedRetailPrice: sourceProduct.suggestedRetailPrice,
              basePrice: sourceProduct.basePrice,
              supplierId: sourceProduct.supplierId,
              supplyDate: sourceProduct.supplyDate,
              expiryDate: sourceProduct.expiryDate,
            },
          },
          { new: true, session },
        )
        .exec();

      // 5. Create stock movement for destination (transfer in)
      await this.inventoryService.recordTransferMovement(
        transfer.destinationBranchId.toString(),
        destinationProduct._id.toString(),
        transfer.quantity,
        approvedBy,
        transferId,
        false, // isSource = false (destination)
        session,
      );

      // 6. Mark transfer as completed
      const completedTransfer = await this.transfersRepository.complete(
        transferId,
        session,
      );

      await session.commitTransaction();

      return completedTransfer!;
    } catch (error) {
      // Property 16: Rollback all changes on failure
      await session.abortTransaction();
      throw error;
    } finally {
      await session.endSession();
    }
  }

  /**
   * Reject a transfer request
   * Property 18: Transfer approval workflow
   */
  async rejectTransfer(
    transferId: string,
    rejectedBy: string,
    dto: RejectTransferDto,
  ): Promise<TransferDocument> {
    const transfer = await this.findById(transferId);

    // Validate transfer is pending
    if (transfer.status !== TransferStatus.PENDING) {
      throw new BadRequestException(
        `Transfer is not pending. Current status: ${transfer.status}`,
      );
    }

    const rejectedTransfer = await this.transfersRepository.reject(
      transferId,
      rejectedBy,
      dto.rejectionReason,
      dto.notes,
    );

    return rejectedTransfer!;
  }

  /**
   * Get transfer statistics
   */
  async getTransferStats(): Promise<{
    pending: number;
    approved: number;
    rejected: number;
    completed: number;
  }> {
    const [pending, approved, rejected, completed] = await Promise.all([
      this.transfersRepository.countByStatus(TransferStatus.PENDING),
      this.transfersRepository.countByStatus(TransferStatus.APPROVED),
      this.transfersRepository.countByStatus(TransferStatus.REJECTED),
      this.transfersRepository.countByStatus(TransferStatus.COMPLETED),
    ]);

    return { pending, approved, rejected, completed };
  }
}
