import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { BatchesRepository } from './batches.repository.js';
import { CreateBatchDto } from './dto/create-batch.dto.js';
import { UpdateBatchDto } from './dto/update-batch.dto.js';
import { BatchDocument } from './schemas/batch.schema.js';
import { BatchSelectionDto, SelectedBatch } from './dto/batch-selection.dto.js';
import { EventsService } from '../websocket/events.service.js';

@Injectable()
export class BatchesService {
  constructor(
    private readonly batchesRepository: BatchesRepository,
    private readonly eventsService: EventsService,
  ) {}

  /**
   * Validate quantity value
   */
  private validateQuantity(quantity: number, fieldName: string = 'quantity'): void {
    if (!Number.isFinite(quantity)) {
      throw new BadRequestException(
        `Invalid ${fieldName}: must be a finite number`,
      );
    }
    if (quantity < 0) {
      throw new BadRequestException(
        `Invalid ${fieldName}: cannot be negative`,
      );
    }
  }

  async create(createBatchDto: CreateBatchDto): Promise<BatchDocument> {
    // Validate required fields
    if (
      !createBatchDto.branchId ||
      !createBatchDto.productId ||
      !createBatchDto.quantity ||
      !createBatchDto.expiryDate ||
      !createBatchDto.lotNumber
    ) {
      throw new BadRequestException(
        'Missing required fields: branchId, productId, quantity, expiryDate, or lotNumber',
      );
    }

    // Validate quantity
    this.validateQuantity(createBatchDto.quantity, 'quantity');

    // Validate expiry date is in the future
    const expiryDate = new Date(createBatchDto.expiryDate);
    if (expiryDate <= new Date()) {
      throw new BadRequestException(
        'Expiry date must be in the future',
      );
    }

    const batch = await this.batchesRepository.create(createBatchDto);

    // Emit batch created event
    this.eventsService.emitBatchUpdate({
      batchId: batch._id.toString(),
      productId: batch.productId.toString(),
      branchId: batch.branchId.toString(),
      quantityAvailable: batch.quantityAvailable,
      updateType: 'created',
      timestamp: new Date(),
    });

    return batch;
  }

  async findAll(): Promise<BatchDocument[]> {
    return this.batchesRepository.findAll();
  }

  async findById(id: string): Promise<BatchDocument> {
    const batch = await this.batchesRepository.findById(id);
    if (!batch) {
      throw new NotFoundException(`Batch with ID ${id} not found`);
    }
    return batch;
  }

  async findByBranch(branchId: string): Promise<BatchDocument[]> {
    return this.batchesRepository.findByBranch(branchId);
  }

  async findByProduct(productId: string): Promise<BatchDocument[]> {
    return this.batchesRepository.findByProduct(productId);
  }

  async findByBranchAndProduct(
    branchId: string,
    productId: string,
  ): Promise<BatchDocument[]> {
    return this.batchesRepository.findByBranchAndProduct(branchId, productId);
  }

  /**
   * FEFO Batch Selection Logic
   * Selects batches in order of earliest expiry date first
   * Handles multi-batch selection for large quantities
   * Excludes expired batches
   *
   * Requirements: 2.3, 5.1, 5.2, 5.5
   * Properties: 19, 20, 21
   */
  async selectBatchesForSale(
    selectionDto: BatchSelectionDto,
  ): Promise<SelectedBatch[]> {
    const { branchId, productId, quantityNeeded } = selectionDto;

    // Validate input
    if (!branchId || !productId) {
      throw new BadRequestException('branchId and productId are required');
    }

    this.validateQuantity(quantityNeeded, 'quantityNeeded');

    if (quantityNeeded === 0) {
      throw new BadRequestException('quantityNeeded must be greater than 0');
    }

    // Get available batches sorted by expiry date (FEFO)
    const availableBatches = await this.batchesRepository.findAvailableForFEFO(
      branchId,
      productId,
    );

    if (availableBatches.length === 0) {
      throw new BadRequestException(
        `No available batches found for product ${productId} at branch ${branchId}`,
      );
    }

    const selectedBatches: SelectedBatch[] = [];
    let remainingQuantity = quantityNeeded;

    // Business rule: newest available batch sets current selling price.
    const latestBatchForPrice = [...availableBatches].sort((a, b) => {
      const aTime = new Date(a.createdAt ?? 0).getTime();
      const bTime = new Date(b.createdAt ?? 0).getTime();
      return bTime - aTime;
    })[0];
    const currentSellingPrice = latestBatchForPrice?.sellingPrice ?? 0;

    // Select batches in FEFO order
    for (const batch of availableBatches) {
      if (remainingQuantity <= 0) {
        break;
      }

      const quantityFromBatch = Math.min(
        batch.quantityAvailable,
        remainingQuantity,
      );

      selectedBatches.push({
        batchId: batch._id.toString(),
        quantity: quantityFromBatch,
        sellingPrice: currentSellingPrice,
        lotNumber: batch.lotNumber,
        expiryDate: batch.expiryDate,
      });

      remainingQuantity -= quantityFromBatch;
    }

    // Check if we have enough stock
    if (remainingQuantity > 0) {
      const totalAvailable = availableBatches.reduce(
        (sum, batch) => sum + batch.quantityAvailable,
        0,
      );
      throw new BadRequestException(
        `Insufficient stock. Requested: ${quantityNeeded}, Available: ${totalAvailable}`,
      );
    }

    return selectedBatches;
  }

  /**
   * Get total available quantity for a product at a branch
   */
  async getAvailableQuantity(
    branchId: string,
    productId: string,
  ): Promise<number> {
    const batches = await this.batchesRepository.findAvailableForFEFO(
      branchId,
      productId,
    );
    return batches.reduce((sum, batch) => sum + batch.quantityAvailable, 0);
  }

  async findExpiring(
    branchId: string,
    daysUntilExpiry: number,
  ): Promise<BatchDocument[]> {
    return this.batchesRepository.findExpiring(branchId, daysUntilExpiry);
  }

  async findExpired(branchId?: string): Promise<BatchDocument[]> {
    return this.batchesRepository.findExpired(branchId);
  }

  async update(
    id: string,
    updateBatchDto: UpdateBatchDto,
  ): Promise<BatchDocument> {
    if ('quantity' in updateBatchDto) {
      throw new BadRequestException(
        'Batch quantity cannot be edited here. Use stock adjustment for quantity corrections.',
      );
    }

    const batch = await this.batchesRepository.update(id, updateBatchDto);
    if (!batch) {
      throw new NotFoundException(`Batch with ID ${id} not found`);
    }

    // Emit batch updated event
    this.eventsService.emitBatchUpdate({
      batchId: batch._id.toString(),
      productId: batch.productId.toString(),
      branchId: batch.branchId.toString(),
      quantityAvailable: batch.quantityAvailable,
      isExpired: batch.isExpired,
      isDepleted: batch.isDepleted,
      updateType: 'updated',
      timestamp: new Date(),
    });

    return batch;
  }

  async updateQuantity(
    id: string,
    quantityChange: number,
  ): Promise<BatchDocument> {
    // Validate quantity change
    if (!Number.isFinite(quantityChange)) {
      throw new BadRequestException(
        'Invalid quantityChange: must be a finite number',
      );
    }

    if (quantityChange === 0) {
      throw new BadRequestException(
        'quantityChange cannot be zero',
      );
    }

    const batch = await this.batchesRepository.updateQuantity(
      id,
      quantityChange,
    );
    if (!batch) {
      throw new NotFoundException(`Batch with ID ${id} not found`);
    }

    // Emit batch updated event
    const updateType = batch.isDepleted ? 'depleted' : 'updated';
    this.eventsService.emitBatchUpdate({
      batchId: batch._id.toString(),
      productId: batch.productId.toString(),
      branchId: batch.branchId.toString(),
      quantityAvailable: batch.quantityAvailable,
      isDepleted: batch.isDepleted,
      updateType,
      timestamp: new Date(),
    });

    return batch;
  }

  async markAsExpired(id: string): Promise<BatchDocument> {
    const batch = await this.batchesRepository.markAsExpired(id);
    if (!batch) {
      throw new NotFoundException(`Batch with ID ${id} not found`);
    }

    // Emit batch expired event
    this.eventsService.emitBatchUpdate({
      batchId: batch._id.toString(),
      productId: batch.productId.toString(),
      branchId: batch.branchId.toString(),
      quantityAvailable: batch.quantityAvailable,
      isExpired: batch.isExpired,
      updateType: 'expired',
      timestamp: new Date(),
    });

    return batch;
  }

  async markExpiredBatches(): Promise<number> {
    return this.batchesRepository.markExpiredBatches();
  }

  async delete(id: string): Promise<void> {
    const batch = await this.batchesRepository.delete(id);
    if (!batch) {
      throw new NotFoundException(`Batch with ID ${id} not found`);
    }
  }
}
