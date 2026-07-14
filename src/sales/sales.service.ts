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
  SaleRefundEntry,
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
  CashFlowDirection,
} from '../finance-manager/schema/cash-entry.schema.js';
import type { CurrentUserData } from '../auth/decorators/current-user.decorator.js';
import { UserRole } from '../users/schemas/user.schema.js';
import { AuditService } from '../audit/audit.service.js';
import { AuditResource } from '../audit/schemas/audit-log.schema.js';
import { BatchesRepository } from '../batches/batches.repository.js';

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
    private readonly batchesRepository: BatchesRepository,
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

        if (!updatedSale) {
          throw new BadRequestException(
            'Payment could not be recorded because the outstanding balance changed. Refresh and try again.',
          );
        }

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
      const cashRefunds = (sale.refunds || [])
        .filter((refund) => refund.paymentMethod === PaymentMethod.CASH)
        .reduce((refundSum, refund) => refundSum + (refund.amount || 0), 0);

      if (sale.payments?.length) {
        return sum + cashPayments - cashRefunds;
      }

      if (sale.paymentMethod === PaymentMethod.CASH) {
        return sum + (sale.total || 0) - cashRefunds;
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
    // Once a payment is made, show progress — even if past due date
    if (amountPaid > 0) {
      return PaymentStatus.PARTIAL;
    }
    if (this.isPastDueDate(dueDate)) {
      return PaymentStatus.OVERDUE;
    }
    return PaymentStatus.UNPAID;
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
    const timestamp = Date.now().toString(36);
    return `${sale.receiptNumber}-PAY-${String(sequence).padStart(2, '0')}-${timestamp}`;
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
    actor: CurrentUserData,
  ): Promise<ReturnResult> {
    // Find the original sale
    const sale = await this.findById(dto.saleId);
    this.assertCanManageSaleBranch(sale, actor);

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
        const saleItem = this.resolveReturnItem(sale, returnItem);
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
        const returnedSale = await this.salesRepository.updateItemReturnedQuantity(
          dto.saleId,
          {
            saleItemId: saleItem.saleItemId,
            batchId: saleItem.batchId?.toString(),
          },
          returnItem.quantity,
          saleItem.quantity - returnItem.quantity,
          session,
        );
        if (!returnedSale) {
          throw new BadRequestException(
            'Return quantity changed while processing. Refresh the sale and try again.',
          );
        }

        if (!saleItem.batchId) {
          throw new BadRequestException(
            `Sale line ${saleItem.saleItemId} has no source batch and cannot be safely restocked`,
          );
        }
        await this.batchesRepository.updateQuantity(
          saleItem.batchId.toString(),
          returnItem.quantity,
          session,
        );

        // Create return stock movement
        await this.inventoryService.recordReturnMovement(
          sale.branchId.toString(),
          returnItem.productId,
          returnItem.quantity,
          actor.userId,
          dto.saleId,
          dto.reason || 'No reason provided',
          session,
        );
      }

      // Determine new sale status
      const newStatus = this.determineReturnStatus(sale, dto.items);
      const totalReturnedAmount = sale.returnedAmount + returnAmount;
      const remainingObligation = Math.max(0, sale.total - totalReturnedAmount);
      const adjustedAmountPaid = Math.min(sale.amountPaid, remainingObligation);
      const cashRefundAmount = Math.max(0, sale.amountPaid - adjustedAmountPaid);
      const adjustedBalanceDue = Math.max(0, remainingObligation - adjustedAmountPaid);
      const adjustedPaymentStatus = this.getCreditPaymentStatus(
        adjustedBalanceDue,
        adjustedAmountPaid,
        sale.dueDate,
      );
      const refunds = this.allocateRefunds(
        sale,
        cashRefundAmount,
        actor.userId,
        dto.reason,
      );

      if (refunds.length > 0) {
        await this.cashEntryModel.create(
          refunds.map((refund, index) => ({
            type: CashEntryType.EXPENSE,
            category: CashEntryCategory.SALES,
            branchId: sale.branchId,
            amount: refund.amount,
            cashFlowDirection: CashFlowDirection.OUTFLOW,
            description: `Customer refund for sale ${sale.receiptNumber}`,
            notes: `${refund.paymentMethod}${dto.reason ? ` - ${dto.reason}` : ''}`,
            receiptNumber: `${sale.receiptNumber}-REF-${String(index + 1).padStart(2, '0')}`,
            referenceId: dto.saleId,
            recordedBy: new Types.ObjectId(actor.userId),
            entryDate: refund.processedAt,
          })),
          { session },
        );
      }

      const updatedSale = await this.salesRepository.applyReturnAccounting(
        dto.saleId,
        newStatus,
        totalReturnedAmount,
        adjustedAmountPaid,
        adjustedBalanceDue,
        adjustedPaymentStatus,
        refunds,
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

      const saleItem = this.resolveReturnItem(sale, returnItem);

      // Check if return quantity is valid
      const availableForReturn = saleItem.quantity - saleItem.returnedQuantity;
      if (returnItem.quantity > availableForReturn) {
        throw new BadRequestException(
          `Cannot return ${returnItem.quantity} units. Only ${availableForReturn} units available for return.`,
        );
      }
    }
  }

  private resolveReturnItem(sale: SaleDocument, returnItem: ReturnItemDto) {
    if (returnItem.saleItemId) {
      const exact = sale.items.find(
        (item) => item.saleItemId === returnItem.saleItemId,
      );
      if (!exact || exact.productId.toString() !== returnItem.productId) {
        throw new BadRequestException(
          `Sale line ${returnItem.saleItemId} is not valid for product ${returnItem.productId}`,
        );
      }
      return exact;
    }

    if (returnItem.batchId) {
      const batchLine = sale.items.find(
        (item) => item.batchId?.toString() === returnItem.batchId,
      );
      if (!batchLine || batchLine.productId.toString() !== returnItem.productId) {
        throw new BadRequestException(
          `Batch ${returnItem.batchId} is not valid for product ${returnItem.productId}`,
        );
      }
      return batchLine;
    }

    const matches = sale.items.filter(
      (item) => item.productId.toString() === returnItem.productId,
    );
    if (matches.length === 0) {
      throw new BadRequestException(
        `Item with productId ${returnItem.productId} not found in original sale`,
      );
    }
    if (matches.length > 1) {
      throw new BadRequestException(
        `Product ${returnItem.productId} was sold from multiple batches; saleItemId is required`,
      );
    }
    return matches[0];
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
      const saleItem = this.resolveReturnItem(sale, returnItem);
      const perBaseUnitSubtotal = saleItem.subtotal / saleItem.quantity;
      const netRatio = sale.subtotal > 0 ? sale.total / sale.subtotal : 0;
      returnAmount += returnItem.quantity * perBaseUnitSubtotal * netRatio;
    }

    return Math.min(
      Math.max(0, sale.total - sale.returnedAmount),
      Math.round(returnAmount * 100) / 100,
    );
  }

  private allocateRefunds(
    sale: SaleDocument,
    amount: number,
    userId: string,
    reason?: string,
  ): SaleRefundEntry[] {
    let remaining = Math.round(amount * 100) / 100;
    if (remaining <= 0) return [];

    const alreadyRefunded = new Map<PaymentMethod, number>();
    for (const refund of sale.refunds ?? []) {
      alreadyRefunded.set(
        refund.paymentMethod,
        (alreadyRefunded.get(refund.paymentMethod) ?? 0) + refund.amount,
      );
    }
    const available = new Map<PaymentMethod, number>();
    for (const payment of sale.payments ?? []) {
      available.set(
        payment.paymentMethod,
        (available.get(payment.paymentMethod) ?? 0) + payment.amount,
      );
    }
    if (available.size === 0) {
      available.set(sale.paymentMethod, sale.amountPaid || sale.total);
    }
    for (const [method, refunded] of alreadyRefunded) {
      available.set(method, Math.max(0, (available.get(method) ?? 0) - refunded));
    }

    const refunds: SaleRefundEntry[] = [];
    for (const [paymentMethod, refundable] of [...available.entries()].reverse()) {
      if (remaining <= 0) break;
      const refundAmount = Math.min(remaining, refundable);
      if (refundAmount <= 0) continue;
      refunds.push({
        amount: Math.round(refundAmount * 100) / 100,
        paymentMethod,
        processedBy: new Types.ObjectId(userId),
        processedAt: new Date(),
        reason,
      });
      remaining = Math.round((remaining - refundAmount) * 100) / 100;
    }
    if (remaining > 0) {
      throw new BadRequestException('Refund exceeds the recorded paid amount');
    }
    return refunds;
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
      const currentReturn = returnItems.find((returnItem) =>
        returnItem.saleItemId
          ? returnItem.saleItemId === saleItem.saleItemId
          : returnItem.batchId
            ? returnItem.batchId === saleItem.batchId?.toString()
            : returnItem.productId === saleItem.productId.toString(),
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
