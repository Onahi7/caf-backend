import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { TransfersRepository } from './transfers.repository.js';
import { BatchesRepository } from '../batches/batches.repository.js';
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
    private readonly batchesRepository: BatchesRepository,
    private readonly branchesRepository: BranchesRepository,
    private readonly inventoryService: InventoryService,
    @InjectConnection() private readonly connection: Connection,
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

    // Validate batch exists and belongs to source branch
    const batch = await this.batchesRepository.findById(dto.batchId);
    if (!batch) {
      throw new NotFoundException(`Batch ${dto.batchId} not found`);
    }

    if (batch.branchId.toString() !== dto.sourceBranchId) {
      throw new BadRequestException(
        'Batch does not belong to the source branch',
      );
    }

    if (batch.productId.toString() !== dto.productId) {
      throw new BadRequestException(
        'Batch does not match the specified product',
      );
    }

    // Validate sufficient quantity
    if (batch.quantityAvailable < dto.quantity) {
      throw new BadRequestException(
        `Insufficient quantity. Available: ${batch.quantityAvailable}, Requested: ${dto.quantity}`,
      );
    }

    // Check if batch is expired
    if (batch.isExpired) {
      throw new BadRequestException('Cannot transfer expired batch');
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

    // Validate batch still has sufficient quantity
    const batch = await this.batchesRepository.findById(
      transfer.batchId.toString(),
    );
    if (!batch) {
      throw new NotFoundException('Transfer batch no longer exists');
    }

    if (batch.quantityAvailable < transfer.quantity) {
      throw new BadRequestException(
        `Insufficient quantity in batch. Available: ${batch.quantityAvailable}, Required: ${transfer.quantity}`,
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

      // 2. Decrement stock at source branch
      await this.batchesRepository.updateQuantity(
        transfer.batchId.toString(),
        -transfer.quantity,
        session,
      );

      // 3. Create stock movement for source (transfer out)
      await this.inventoryService.recordTransferMovement(
        transfer.sourceBranchId.toString(),
        transfer.productId.toString(),
        transfer.batchId.toString(),
        transfer.quantity,
        approvedBy,
        transferId,
        true, // isSource
        session,
      );

      // 4. Create or update batch at destination branch
      // For simplicity, we create a new batch at the destination
      const newBatch = await this.batchesRepository.create({
        productId: transfer.productId.toString(),
        branchId: transfer.destinationBranchId.toString(),
        lotNumber: batch.lotNumber,
        expiryDate: batch.expiryDate,
        quantity: transfer.quantity,
        purchasePrice: batch.purchasePrice,
        sellingPrice: batch.sellingPrice,
        supplierId: batch.supplierId.toString(),
      }, session);

      // 5. Create stock movement for destination (transfer in)
      await this.inventoryService.recordTransferMovement(
        transfer.destinationBranchId.toString(),
        transfer.productId.toString(),
        newBatch._id.toString(),
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
