import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Interval } from '@nestjs/schedule';
import { Connection, Model, Types } from 'mongoose';
import { SalesRepository } from './sales.repository.js';
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
import { Product, ProductDocument } from '../products/schemas/product.schema.js';
import {
  CashEntry,
  CashEntryCategory,
  CashEntryDocument,
  CashEntryType,
} from '../finance-manager/schema/cash-entry.schema.js';
import type { CurrentUserData } from '../auth/decorators/current-user.decorator.js';
import { UserRole } from '../users/schemas/user.schema.js';
import { AuditService } from '../audit/audit.service.js';
import { AuditResource } from '../audit/schemas/audit-log.schema.js';

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
export class SalesService implements OnModuleInit {
  private readonly logger = new Logger(SalesService.name);

  constructor(
    private readonly salesRepository: SalesRepository,
    private readonly inventoryService: InventoryService,
    private readonly eventsService: EventsService,
    private readonly auditService: AuditService,
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Product.name) private readonly productModel: Model<ProductDocument>,
    @InjectModel(CashEntry.name) private readonly cashEntryModel: Model<CashEntryDocument>,
  ) {}

  onModuleInit(): void {
    void this.markOverdueCreditSales();
  }

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
    if (!filter || filter.saleType === SaleType.CREDIT) {
      await this.markOverdueCreditSales(filter?.branchId);
    }
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
    actor: CurrentUserData,
  ): Promise<SaleDocument> {
    if (dto.paymentMethod === PaymentMethod.CREDIT) {
      throw new BadRequestException(
        'Recorded payments must use a real payment method',
      );
    }

    const sale = await this.findById(saleId);
    this.assertCanManageSaleBranch(sale, actor);

    if (sale.saleType !== SaleType.CREDIT) {
      throw new BadRequestException(
        'Payments can only be recorded against credit sales',
      );
    }

    if (sale.balanceDue <= 0) {
      throw new BadRequestException('This sale has already been fully paid');
    }

    if (dto.amount > sale.balanceDue) {
      throw new BadRequestException(
        `Payment exceeds outstanding balance of ${sale.balanceDue}`,
      );
    }

    const nextAmountPaid = sale.amountPaid + dto.amount;
    const nextBalanceDue = Math.max(0, sale.balanceDue - dto.amount);
    const nextPaymentStatus = this.getCreditPaymentStatus(
      nextBalanceDue,
      nextAmountPaid,
      sale.dueDate,
    );
    const paymentReceiptNumber = this.generateCreditPaymentReceiptNumber(sale);
    const payment: SalePaymentEntry = {
      paymentReceiptNumber,
      amount: dto.amount,
      paymentMethod: dto.paymentMethod,
      paymentReference: dto.paymentReference,
      receivedBy: new Types.ObjectId(actor.userId),
      receivedAt: new Date(),
      notes: dto.notes,
      isInitialPayment: false,
      balanceAfterPayment: nextBalanceDue,
    };

    const session = await this.connection.startSession();
    let updatedSale: SaleDocument | null = null;
    try {
      await session.withTransaction(async () => {
        updatedSale = await this.salesRepository.recordPayment(
          saleId,
          payment,
          nextAmountPaid,
          nextBalanceDue,
          nextPaymentStatus,
          session,
        );

        await this.cashEntryModel.create([{
          type: CashEntryType.INCOME,
          category: CashEntryCategory.SALES,
          branchId: sale.branchId,
          amount: dto.amount,
          description: `Credit payment received for ${sale.receiptNumber}`,
          notes: dto.notes,
          receiptNumber: paymentReceiptNumber,
          referenceId: sale._id.toString(),
          recordedBy: new Types.ObjectId(actor.userId),
          entryDate: payment.receivedAt,
          isActive: true,
        }], { session });
      });
    } finally {
      await session.endSession();
    }

    if (!updatedSale) {
      throw new NotFoundException(`Sale with ID ${saleId} not found`);
    }

    await this.auditCreditPayment(sale, updatedSale, payment, actor);
    return updatedSale;
  }

  async calculateShiftCashCollections(shiftId: string): Promise<number> {
    const sales = await this.salesRepository.findByShift(shiftId);
    return sales.reduce((sum, sale) => {
      const cashPayments = (sale.payments || [])
        .filter((payment) => payment.paymentMethod === PaymentMethod.CASH)
        .reduce((paymentSum, payment) => paymentSum + (payment.amount || 0), 0);

      if (sale.payments?.length) {
        return sum + cashPayments - (sale.returnedAmount || 0);
      }

      if (sale.paymentMethod === PaymentMethod.CASH) {
        return sum + (sale.total || 0) - (sale.returnedAmount || 0);
      }

      return sum;
    }, 0);
  }

  @Interval(60 * 60 * 1000)
  async markOverdueCreditSales(branchId?: string): Promise<number> {
    const modified = await this.salesRepository.markOverdueCreditSales(branchId);
    if (modified > 0) {
      this.logger.log(`Marked ${modified} credit sale(s) overdue`);
    }
    return modified;
  }

  private getCreditPaymentStatus(
    balanceDue: number,
    amountPaid: number,
    dueDate?: Date,
  ): PaymentStatus {
    if (balanceDue <= 0) {
      return PaymentStatus.PAID;
    }
    if (this.isPastDueDate(dueDate)) {
      return PaymentStatus.OVERDUE;
    }
    return amountPaid > 0 ? PaymentStatus.PARTIAL : PaymentStatus.UNPAID;
  }

  private isPastDueDate(dueDate?: Date): boolean {
    if (!dueDate) {
      return false;
    }
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    return dueDate < startOfToday;
  }

  private assertCanManageSaleBranch(sale: SaleDocument, actor: CurrentUserData): void {
    if (actor.role === UserRole.SUPER_ADMIN) {
      return;
    }

    if (!actor.branchId || sale.branchId.toString() !== actor.branchId) {
      throw new ForbiddenException('You can only record payments for your assigned branch');
    }
  }

  private generateCreditPaymentReceiptNumber(sale: SaleDocument): string {
    const sequence = (sale.payments?.length || 0) + 1;
    return `${sale.receiptNumber}-PAY-${String(sequence).padStart(2, '0')}`;
  }

  private async auditCreditPayment(
    previousSale: SaleDocument,
    updatedSale: SaleDocument,
    payment: SalePaymentEntry,
    actor: CurrentUserData,
  ): Promise<void> {
    try {
      await this.auditService.logUpdate(
        actor.userId,
        actor.username,
        AuditResource.SALE,
        updatedSale._id.toString(),
        {
          amountPaid: previousSale.amountPaid,
          balanceDue: previousSale.balanceDue,
          paymentStatus: previousSale.paymentStatus,
        },
        {
          amountPaid: updatedSale.amountPaid,
          balanceDue: updatedSale.balanceDue,
          paymentStatus: updatedSale.paymentStatus,
        },
        updatedSale.branchId.toString(),
        {
          event: 'credit_payment_received',
          paymentReceiptNumber: payment.paymentReceiptNumber,
          paymentMethod: payment.paymentMethod,
          amount: payment.amount,
        },
      );
    } catch (error) {
      this.logger.warn(
        `Credit payment recorded but audit log failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
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
        const updatedProduct = await this.productModel
          .findOneAndUpdate(
            {
              _id: new Types.ObjectId(returnItem.productId),
              branchId: sale.branchId,
            },
            { $inc: { quantityAvailable: returnItem.quantity } },
            { new: true, session },
          )
          .exec();

        if (!updatedProduct) {
          throw new NotFoundException(
            `Product ${returnItem.productId} not found for this branch`,
          );
        }

        // Persist item-level returned quantity for accurate partial/full return tracking
        await this.salesRepository.updateItemReturnedQuantity(
          dto.saleId,
          returnItem.productId,
          returnItem.quantity,
          session,
        );

        // Create return stock movement
        await this.inventoryService.recordReturnMovement(
          sale.branchId.toString(),
          returnItem.productId,
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
      if (!returnItem.productId) {
        throw new BadRequestException(
          'Each return item must have productId',
        );
      }

      if (!Number.isFinite(returnItem.quantity) || returnItem.quantity <= 0) {
        throw new BadRequestException(
          `Invalid return quantity: ${returnItem.quantity}. Must be a positive number.`,
        );
      }

      // Find matching item in original sale
      const saleItem = sale.items.find(
        (item) => item.productId.toString() === returnItem.productId,
      );

      if (!saleItem) {
        throw new BadRequestException(
          `Item with productId ${returnItem.productId} not found in original sale`,
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
        (item) => item.productId.toString() === returnItem.productId,
      );

      if (saleItem) {
        const perBaseUnitPrice = saleItem.packSize?.quantityPerPack
          ? saleItem.unitPrice / saleItem.packSize.quantityPerPack
          : saleItem.unitPrice;
        returnAmount += returnItem.quantity * perBaseUnitPrice;
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
        (ri) => ri.productId === saleItem.productId.toString(),
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
    verifiedByUserId: string,
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
      verifiedByUserId,
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
