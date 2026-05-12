import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import { SalesRepository } from './sales.repository.js';
import { BatchesRepository } from '../batches/batches.repository.js';
import { InventoryService } from '../inventory/inventory.service.js';
import { ProcessReturnDto, ReturnItemDto } from './dto/process-return.dto.js';
import { ReceiveSalePaymentDto } from './dto/receive-sale-payment.dto.js';
import { SaleFilterDto } from './dto/sale-filter.dto.js';
import { VerifyPrescriptionDto } from './dto/verify-prescription.dto.js';
import {
  PaymentMethod,
  PaymentStatus,
  SaleDocument,
  SalePaymentEntry,
  SaleStatus,
  SaleType,
  PrescriptionStatus,
} from './schemas/sale.schema.js';
import { EventsService } from '../websocket/events.service.js';

/**
 * Return processing result
 */
export interface ReturnResult {
  sale: SaleDocument;
  returnedItems: number;
  returnedAmount: number;
  newStatus: SaleStatus;
}

/**
 * SalesService
 * Handles sales queries, returns, and prescription management
 * Requirements: 11.1, 11.4, 11.5, 22.1, 22.3, 22.4
 * Properties: 44, 47, 48, 79, 80, 81
 */
@Injectable()
export class SalesService {
  private readonly logger = new Logger(SalesService.name);

  constructor(
    private readonly salesRepository: SalesRepository,
    private readonly batchesRepository: BatchesRepository,
    private readonly inventoryService: InventoryService,
    private readonly eventsService: EventsService,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  /**
   * Find sale by ID
   */
  async findById(id: string): Promise<SaleDocument> {
    const sale = await this.salesRepository.findById(id);
    if (!sale) {
      throw new NotFoundException(`Sale with ID ${id} not found`);
    }
    return sale;
  }

  /**
   * Find sale by receipt number
   */
  async findByReceiptNumber(receiptNumber: string): Promise<SaleDocument> {
    const sale = await this.salesRepository.findByReceiptNumber(receiptNumber);
    if (!sale) {
      throw new NotFoundException(
        `Sale with receipt number ${receiptNumber} not found`,
      );
    }
    return sale;
  }

  /**
   * Find sales with filtering
   */
  async findAll(filter?: SaleFilterDto): Promise<SaleDocument[]> {
    return this.salesRepository.findWithFilter(filter || {});
  }

  /**
   * Find sales by shift
   */
  async findByShift(shiftId: string): Promise<SaleDocument[]> {
    return this.salesRepository.findByShift(shiftId);
  }

  /**
   * Find sales by branch
   */
  async findByBranch(branchId: string): Promise<SaleDocument[]> {
    return this.salesRepository.findByBranch(branchId);
  }

  /**
   * Calculate total sales for a shift
   */
  async calculateShiftTotal(shiftId: string): Promise<number> {
    return this.salesRepository.calculateShiftTotal(shiftId);
  }

  async recordPayment(
    saleId: string,
    dto: ReceiveSalePaymentDto,
    userId: string,
  ): Promise<SaleDocument> {
    const sale = await this.findById(saleId);

    if (sale.saleType !== SaleType.CREDIT) {
      throw new BadRequestException(
        'Payments can only be recorded against credit sales',
      );
    }

    if (sale.balanceDue <= 0) {
      throw new BadRequestException('This sale has already been fully paid');
    }

    if (dto.paymentMethod === PaymentMethod.CREDIT) {
      throw new BadRequestException(
        'Recorded payments must use a real payment method',
      );
    }

    if (dto.amount > sale.balanceDue) {
      throw new BadRequestException(
        `Payment exceeds outstanding balance of ${sale.balanceDue}`,
      );
    }

    const payment: SalePaymentEntry = {
      amount: dto.amount,
      paymentMethod: dto.paymentMethod,
      paymentReference: dto.paymentReference,
      receivedBy: new Types.ObjectId(userId),
      receivedAt: new Date(),
      notes: dto.notes,
      isInitialPayment: false,
    };

    const nextAmountPaid = sale.amountPaid + dto.amount;
    const nextBalanceDue = Math.max(0, sale.balanceDue - dto.amount);
    const nextPaymentStatus =
      nextBalanceDue <= 0 ? PaymentStatus.PAID : PaymentStatus.PARTIAL;

    const updatedSale = await this.salesRepository.recordPayment(
      saleId,
      payment,
      nextAmountPaid,
      nextBalanceDue,
      nextPaymentStatus,
    );

    if (!updatedSale) {
      throw new NotFoundException(`Sale with ID ${saleId} not found`);
    }

    return updatedSale;
  }

  /**
   * Process a return
   * Requirements: 11.1, 11.4, 11.5
   * Property 44: Return stock increment
   * Property 47: Partial return support
   * Property 48: Sale record update on return
   */
  async processReturn(
    dto: ProcessReturnDto,
    userId: string,
  ): Promise<ReturnResult> {
    // Find the original sale
    const sale = await this.findById(dto.saleId);

    // Validate sale can be returned
    if (sale.status === SaleStatus.RETURNED) {
      throw new BadRequestException('Sale has already been fully returned');
    }

    // Validate return items
    this.validateReturnItems(sale, dto.items);

    // Calculate return amount
    const returnAmount = this.calculateReturnAmount(sale, dto.items);

    // Execute return in a transaction
    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      // Process each return item
      for (const returnItem of dto.items) {
        // Update batch quantity (increment)
        // Property 44: Return stock increment
        await this.batchesRepository.updateQuantity(
          returnItem.batchId,
          returnItem.quantity,
          session,
        );

        // Persist item-level returned quantity for accurate partial/full return tracking
        await this.salesRepository.updateItemReturnedQuantity(
          dto.saleId,
          returnItem.productId,
          returnItem.batchId,
          returnItem.quantity,
          session,
        );

        // Create return stock movement
        await this.inventoryService.recordReturnMovement(
          sale.branchId.toString(),
          returnItem.productId,
          returnItem.batchId,
          returnItem.quantity,
          userId,
          dto.saleId,
          dto.reason || 'No reason provided',
          session,
        );
      }

      // Determine new sale status
      const newStatus = this.determineReturnStatus(sale, dto.items);
      const totalReturnedAmount = sale.returnedAmount + returnAmount;

      // Update sale status
      // Property 48: Sale record update on return
      const updatedSale = await this.salesRepository.updateStatus(
        dto.saleId,
        newStatus,
        totalReturnedAmount,
        session,
      );

      await session.commitTransaction();
      this.logger.log(
        `Return processed for sale ${sale.receiptNumber}: ${returnAmount}, Status: ${newStatus}`,
      );

      // Emit sale update event after successful transaction
      this.eventsService.emitSaleUpdate({
        saleId: dto.saleId,
        branchId: sale.branchId.toString(),
        shiftId: sale.shiftId.toString(),
        total: updatedSale!.total,
        paymentMethod: sale.paymentMethod,
        paymentReference: sale.paymentReference,
        items: updatedSale!.items.map((item) => ({
          productId: item.productId.toString(),
          batchId: item.batchId.toString(),
          quantity: item.quantity,
        })),
        updateType:
          newStatus === SaleStatus.RETURNED ? 'returned' : 'partially_returned',
        timestamp: new Date(),
      });

      return {
        sale: updatedSale!,
        returnedItems: dto.items.length,
        returnedAmount: returnAmount,
        newStatus,
      };
    } catch (error) {
      await session.abortTransaction();
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `Return failed for sale ${dto.saleId}: ${errorMessage}`,
        errorStack,
      );
      throw error;
    } finally {
      await session.endSession();
    }
  }

  /**
   * Validate return items against original sale
   */
  private validateReturnItems(
    sale: SaleDocument,
    returnItems: ReturnItemDto[],
  ): void {
    if (!returnItems || returnItems.length === 0) {
      throw new BadRequestException('Return items cannot be empty');
    }

    for (const returnItem of returnItems) {
      // Validate return item properties
      if (!returnItem.productId || !returnItem.batchId) {
        throw new BadRequestException(
          'Each return item must have productId and batchId',
        );
      }

      if (!Number.isFinite(returnItem.quantity) || returnItem.quantity <= 0) {
        throw new BadRequestException(
          `Invalid return quantity: ${returnItem.quantity}. Must be a positive number.`,
        );
      }

      // Find matching item in original sale
      const saleItem = sale.items.find(
        (item) =>
          item.productId.toString() === returnItem.productId &&
          item.batchId.toString() === returnItem.batchId,
      );

      if (!saleItem) {
        throw new BadRequestException(
          `Item with productId ${returnItem.productId} and batchId ${returnItem.batchId} not found in original sale`,
        );
      }

      // Check if return quantity is valid
      const availableForReturn = saleItem.quantity - saleItem.returnedQuantity;
      if (returnItem.quantity > availableForReturn) {
        throw new BadRequestException(
          `Cannot return ${returnItem.quantity} units. Only ${availableForReturn} units available for return.`,
        );
      }
    }
  }

  /**
   * Calculate return amount based on items
   */
  private calculateReturnAmount(
    sale: SaleDocument,
    returnItems: ReturnItemDto[],
  ): number {
    let returnAmount = 0;

    for (const returnItem of returnItems) {
      const saleItem = sale.items.find(
        (item) =>
          item.productId.toString() === returnItem.productId &&
          item.batchId.toString() === returnItem.batchId,
      );

      if (saleItem) {
        returnAmount += returnItem.quantity * saleItem.unitPrice;
      }
    }

    return returnAmount;
  }

  /**
   * Determine sale status after return
   */
  private determineReturnStatus(
    sale: SaleDocument,
    returnItems: ReturnItemDto[],
  ): SaleStatus {
    // Calculate total items and total returned after this return
    let totalQuantity = 0;
    let totalReturned = 0;

    for (const saleItem of sale.items) {
      totalQuantity += saleItem.quantity;
      totalReturned += saleItem.returnedQuantity;

      // Add current return quantities
      const currentReturn = returnItems.find(
        (ri) =>
          ri.productId === saleItem.productId.toString() &&
          ri.batchId === saleItem.batchId.toString(),
      );
      if (currentReturn) {
        totalReturned += currentReturn.quantity;
      }
    }

    if (totalReturned >= totalQuantity) {
      return SaleStatus.RETURNED;
    }
    return SaleStatus.PARTIALLY_RETURNED;
  }

  /**
   * Verify prescription for a sale
   * Requirements: 22.4
   * Property 81: Prescription verification status
   */
  async verifyPrescription(
    dto: VerifyPrescriptionDto,
    pharmacistId: string,
  ): Promise<SaleDocument> {
    const sale = await this.findById(dto.saleId);

    if (!sale.prescriptionUrl) {
      throw new BadRequestException(
        'Sale does not have a prescription attached',
      );
    }

    const updatedSale = await this.salesRepository.updatePrescriptionStatus(
      dto.saleId,
      dto.status,
      pharmacistId,
    );

    if (!updatedSale) {
      throw new NotFoundException(`Sale with ID ${dto.saleId} not found`);
    }

    this.logger.log(
      `Prescription ${dto.status} for sale ${sale.receiptNumber}`,
    );

    return updatedSale;
  }

  /**
   * Get sales requiring prescription verification
   */
  async getSalesPendingPrescriptionVerification(
    branchId?: string,
  ): Promise<SaleDocument[]> {
    const filter: SaleFilterDto = {
      branchId,
    };

    const sales = await this.salesRepository.findWithFilter(filter);

    // Filter for sales with pending prescription status
    return sales.filter(
      (sale) =>
        sale.prescriptionUrl &&
        sale.prescriptionStatus === PrescriptionStatus.PENDING,
    );
  }

  /**
   * Get sales statistics for a branch
   */
  async getSalesStats(
    branchId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<{
    totalSales: number;
    totalAmount: number;
    totalReturns: number;
    averageTransaction: number;
  }> {
    return this.salesRepository.getSalesStats(branchId, startDate, endDate);
  }

  /**
   * Count sales for a shift
   */
  async countByShift(shiftId: string): Promise<number> {
    return this.salesRepository.countByShift(shiftId);
  }
}
