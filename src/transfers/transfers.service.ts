import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { TransfersRepository } from './transfers.repository.js';
import { BranchesRepository } from '../branches/branches.repository.js';
import { InventoryService } from '../inventory/inventory.service.js';
import { AuditService } from '../audit/audit.service.js';
import { AuditResource } from '../audit/schemas/audit-log.schema.js';
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
import { User, UserDocument } from '../users/schemas/user.schema.js';
import { BatchesRepository } from '../batches/batches.repository.js';

@Injectable()
export class TransfersService {
  private readonly logger = new Logger(TransfersService.name);

  constructor(
    private readonly transfersRepository: TransfersRepository,
    private readonly branchesRepository: BranchesRepository,
    private readonly inventoryService: InventoryService,
    private readonly batchesRepository: BatchesRepository,
    private readonly auditService: AuditService,
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Product.name) private readonly productModel: Model<ProductDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  /**
   * Create a transfer request
   */
  async createTransferRequest(
    dto: CreateTransferDto,
    requestedBy: string,
  ): Promise<TransferDocument> {
    const [sourceBranch, destinationBranch] = await Promise.all([
      this.branchesRepository.findById(dto.sourceBranchId),
      this.branchesRepository.findById(dto.destinationBranchId),
    ]);

    if (!sourceBranch) {
      throw new NotFoundException(`Source branch ${dto.sourceBranchId} not found`);
    }
    if (!destinationBranch) {
      throw new NotFoundException(`Destination branch ${dto.destinationBranchId} not found`);
    }
    if (dto.sourceBranchId === dto.destinationBranchId) {
      throw new BadRequestException('Source and destination branches must be different');
    }

    const product = await this.productModel.findById(dto.productId).exec();
    if (!product) {
      throw new NotFoundException(`Product ${dto.productId} not found`);
    }
    if (product.branchId.toString() !== dto.sourceBranchId) {
      throw new BadRequestException('Product does not belong to the source branch');
    }
    if (product.quantityAvailable < dto.quantity) {
      throw new BadRequestException(
        `Insufficient quantity. Available: ${product.quantityAvailable}, Requested: ${dto.quantity}`,
      );
    }

    const transferType = this.determineTransferType(sourceBranch, destinationBranch);
    const transfer = await this.transfersRepository.create(dto, requestedBy, transferType);

    // Audit: transfer requested
    const requester = await this.userModel.findById(requestedBy).select('username firstName lastName').lean().exec();
    const requesterName = requester ? `${requester.firstName} ${requester.lastName}` : requestedBy;
    await this.auditService.logCreate(
      requestedBy,
      requesterName,
      AuditResource.TRANSFER,
      transfer._id.toString(),
      { quantity: dto.quantity, productName: product.name, sourceBranch: sourceBranch.name, destinationBranch: destinationBranch.name },
      dto.sourceBranchId,
    );

    this.logger.log(`Transfer ${transfer._id} requested by ${requesterName}: ${dto.quantity} x ${product.name}`);

    return transfer;
  }

  private determineTransferType(
    sourceBranch: { isHeadquarters: boolean },
    destinationBranch: { isHeadquarters: boolean },
  ): TransferType {
    if (sourceBranch.isHeadquarters && !destinationBranch.isHeadquarters) {
      return TransferType.HQ_TO_OUTLET;
    }
    if (!sourceBranch.isHeadquarters && destinationBranch.isHeadquarters) {
      return TransferType.OUTLET_TO_HQ;
    }
    return TransferType.OUTLET_TO_OUTLET;
  }

  async findAll(filter?: TransferFilterDto): Promise<TransferDocument[]> {
    if (filter && Object.keys(filter).length > 0) {
      return this.transfersRepository.findWithFilter(filter);
    }
    return this.transfersRepository.findAll();
  }

  async findById(id: string): Promise<TransferDocument> {
    const transfer = await this.transfersRepository.findById(id);
    if (!transfer) {
      throw new NotFoundException(`Transfer ${id} not found`);
    }
    return transfer;
  }

  async findPending(): Promise<TransferDocument[]> {
    return this.transfersRepository.findPending();
  }

  async findPendingForBranch(branchId: string): Promise<TransferDocument[]> {
    return this.transfersRepository.findPendingForBranch(branchId);
  }

  /**
   * Approve and execute a transfer.
   * If the product doesn't exist at the destination, it will be created there.
   */
  async approveTransfer(
    transferId: string,
    approvedBy: string,
    dto: ApproveTransferDto,
  ): Promise<TransferDocument> {
    const transfer = await this.findById(transferId);

    if (transfer.status !== TransferStatus.PENDING) {
      throw new BadRequestException(`Transfer is not pending. Current status: ${transfer.status}`);
    }

    const sourceProduct = await this.productModel.findById(transfer.productId).exec();
    if (!sourceProduct) {
      throw new NotFoundException('Transfer product no longer exists');
    }

    if (sourceProduct.quantityAvailable < transfer.quantity) {
      throw new BadRequestException(
        `Insufficient quantity. Available: ${sourceProduct.quantityAvailable}, Required: ${transfer.quantity}`,
      );
    }

    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      const sourceBatches = await this.batchesRepository.findAvailableForFEFO(
        transfer.sourceBranchId.toString(),
        transfer.productId.toString(),
      );
      let quantityToMove = transfer.quantity;
      const batchMoves: Array<{ batch: (typeof sourceBatches)[number]; quantity: number }> = [];
      for (const batch of sourceBatches) {
        if (quantityToMove <= 0) break;
        const quantity = Math.min(quantityToMove, batch.quantityAvailable);
        batchMoves.push({ batch, quantity });
        quantityToMove -= quantity;
      }
      if (quantityToMove > 0) {
        throw new BadRequestException(
          `Insufficient sellable batch stock. Missing ${quantityToMove} units.`,
        );
      }

      // 1. Approve the transfer
      await this.transfersRepository.approve(transferId, approvedBy, dto.notes, session);

      // 2. Deduct from source
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
        throw new BadRequestException('Insufficient quantity. Stock changed before approval.');
      }

      // 3. Record source stock movement
      await this.inventoryService.recordTransferMovement(
        transfer.sourceBranchId.toString(),
        transfer.productId.toString(),
        transfer.quantity,
        approvedBy,
        transferId,
        true,
        session,
      );

      // 4. Find or create destination product
      let destinationProduct = await this.productModel
        .findOne({ branchId: transfer.destinationBranchId, sku: sourceProduct.sku })
        .session(session)
        .exec();

      if (destinationProduct) {
        // Product exists at destination - increment stock
        await this.productModel.findByIdAndUpdate(
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
        ).exec();
      } else {
        // Product doesn't exist at destination - create it
        const newProductData = {
          branchId: new Types.ObjectId(transfer.destinationBranchId.toString()),
          name: sourceProduct.name,
          sku: sourceProduct.sku,
          barcode: sourceProduct.barcode,
          category: sourceProduct.category,
          brand: sourceProduct.brand,
          unit: sourceProduct.unit,
          reorderLevel: sourceProduct.reorderLevel,
          maxStockLevel: sourceProduct.maxStockLevel,
          quantityAvailable: transfer.quantity,
          quantityInitial: transfer.quantity,
          basePrice: sourceProduct.basePrice,
          costPrice: sourceProduct.costPrice,
          suggestedRetailPrice: sourceProduct.suggestedRetailPrice,
          markupPercentage: sourceProduct.markupPercentage,
          requiresPrescription: sourceProduct.requiresPrescription,
          isControlled: sourceProduct.isControlled,
          packSizes: sourceProduct.packSizes,
          supplierId: sourceProduct.supplierId,
          supplyDate: sourceProduct.supplyDate,
          expiryDate: sourceProduct.expiryDate,
          isActive: true,
        };

        const [created] = await this.productModel.create([newProductData], { session });
        destinationProduct = created;

        this.logger.log(`Created product "${sourceProduct.name}" (${sourceProduct.sku}) at destination branch ${transfer.destinationBranchId}`);
      }

      // 5. Record destination stock movement
      await this.inventoryService.recordTransferMovement(
        transfer.destinationBranchId.toString(),
        destinationProduct._id.toString(),
        transfer.quantity,
        approvedBy,
        transferId,
        false,
        session,
      );

      // Move the exact FEFO batch quantities so both branch ledgers remain sellable.
      const destinationBatches = await this.batchesRepository.findByBranchAndProduct(
        transfer.destinationBranchId.toString(),
        destinationProduct._id.toString(),
      );
      for (const { batch, quantity } of batchMoves) {
        await this.batchesRepository.updateQuantity(
          batch._id.toString(),
          -quantity,
          session,
        );
        const matchingDestinationBatch = destinationBatches.find(
          (candidate) => candidate.lotNumber === batch.lotNumber,
        );
        if (matchingDestinationBatch) {
          await this.batchesRepository.updateQuantity(
            matchingDestinationBatch._id.toString(),
            quantity,
            session,
          );
        } else {
          const supplierId =
            (batch.supplierId as unknown as { _id?: Types.ObjectId })._id ??
            batch.supplierId;
          await this.batchesRepository.create(
            {
              productId: destinationProduct._id.toString(),
              branchId: transfer.destinationBranchId.toString(),
              lotNumber: batch.lotNumber,
              expiryDate: batch.expiryDate,
              quantity,
              purchasePrice: batch.purchasePrice,
              sellingPrice: batch.sellingPrice,
              supplierId: supplierId.toString(),
            },
            session,
          );
        }
      }

      // 6. Mark transfer as completed
      const completedTransfer = await this.transfersRepository.complete(transferId, session);

      await session.commitTransaction();

      // Audit: transfer approved and completed
      const approver = await this.userModel.findById(approvedBy).select('username firstName lastName').lean().exec();
      const approverName = approver ? `${approver.firstName} ${approver.lastName}` : approvedBy;
      await this.auditService.logUpdate(
        approvedBy,
        approverName,
        AuditResource.TRANSFER,
        transferId,
        { status: 'pending' },
        { status: 'completed', quantity: transfer.quantity, productName: sourceProduct.name },
        transfer.sourceBranchId.toString(),
      );

      this.logger.log(`Transfer ${transferId} approved by ${approverName}: ${transfer.quantity} x ${sourceProduct.name}`);

      return completedTransfer!;
    } catch (error) {
      await session.abortTransaction();
      this.logger.error(`Transfer ${transferId} approval failed: ${error instanceof Error ? error.message : error}`);
      throw error;
    } finally {
      await session.endSession();
    }
  }

  /**
   * Reject a transfer request
   */
  async rejectTransfer(
    transferId: string,
    rejectedBy: string,
    dto: RejectTransferDto,
  ): Promise<TransferDocument> {
    const transfer = await this.findById(transferId);

    if (transfer.status !== TransferStatus.PENDING) {
      throw new BadRequestException(`Transfer is not pending. Current status: ${transfer.status}`);
    }

    const rejectedTransfer = await this.transfersRepository.reject(
      transferId,
      rejectedBy,
      dto.rejectionReason,
      dto.notes,
    );

    // Audit: transfer rejected
    const rejector = await this.userModel.findById(rejectedBy).select('username firstName lastName').lean().exec();
    const rejectorName = rejector ? `${rejector.firstName} ${rejector.lastName}` : rejectedBy;
    await this.auditService.logUpdate(
      rejectedBy,
      rejectorName,
      AuditResource.TRANSFER,
      transferId,
      { status: 'pending' },
      { status: 'rejected', rejectionReason: dto.rejectionReason },
      transfer.sourceBranchId.toString(),
    );

    this.logger.log(`Transfer ${transferId} rejected by ${rejectorName}: ${dto.rejectionReason}`);

    return rejectedTransfer!;
  }

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
