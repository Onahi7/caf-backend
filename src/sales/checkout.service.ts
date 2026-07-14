import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, ClientSession, Types, Model } from 'mongoose';
import { SalesRepository } from './sales.repository.js';
import { BatchesService } from '../batches/batches.service.js';
import { BatchesRepository } from '../batches/batches.repository.js';
import { InventoryService } from '../inventory/inventory.service.js';
import { ShiftsService } from '../shifts/shifts.service.js';
import { CreateSaleDto, SaleItemDto, SaleItemPackSizeDto } from './dto/create-sale.dto.js';
import {
  PaymentMethod,
  PaymentStatus,
  SaleDocument,
  SaleItem,
  SalePaymentEntry,
  SaleType,
  PrescriptionStatus,
} from './schemas/sale.schema.js';
import { EventsService } from '../websocket/events.service.js';
import { Product, ProductDocument } from '../products/schemas/product.schema.js';
import { SelectedBatch } from '../batches/dto/batch-selection.dto.js';
import { PromotionsService } from '../promotions/promotions.service.js';
import { TaxConfig, TaxConfigDocument, TaxType } from '../settings/schemas/tax-config.schema.js';
import type { CurrentUserData } from '../auth/decorators/current-user.decorator.js';
import { UserRole } from '../users/schemas/user.schema.js';
import { CheckoutQuoteDto } from './dto/checkout-quote.dto.js';
import { AuditService } from '../audit/audit.service.js';
import { AuditResource } from '../audit/schemas/audit-log.schema.js';

/**
 * Result of batch selection for a sale item with pack size info
 */
interface BatchSelectionResult {
  productId: string;
  selectedBatches: SelectedBatch[];
  totalQuantity: number;
  totalAmount: number;
  unitPrice: number;
  packSize?: SaleItemPackSizeDto;
  originalQuantity: number;
}

/**
 * Checkout result with sale details
 */
export interface CheckoutResult {
  sale: SaleDocument;
  receiptNumber: string;
  itemsProcessed: number;
  totalAmount: number;
}

/**
 * CheckoutService
 * Handles checkout processing with product-level stock selection and MongoDB transactions
 * Requirements: 5.1, 5.2, 5.3, 17.1
 * Properties: 19, 20, 21
 */
@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);

constructor(
    private readonly salesRepository: SalesRepository,
    private readonly batchesService: BatchesService,
    private readonly batchesRepository: BatchesRepository,
    private readonly inventoryService: InventoryService,
    private readonly shiftsService: ShiftsService,
    private readonly eventsService: EventsService,
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Product.name) private readonly productModel: Model<ProductDocument>,
    @InjectModel(TaxConfig.name) private readonly taxConfigModel: Model<TaxConfigDocument>,
    private readonly promotionsService: PromotionsService,
    private readonly auditService: AuditService,
  ) {}

  async quote(dto: CheckoutQuoteDto, actor: CurrentUserData) {
    if (
      actor.role !== UserRole.SUPER_ADMIN &&
      (!actor.branchId || actor.branchId !== dto.branchId)
    ) {
      throw new BadRequestException('Quote is restricted to your assigned branch');
    }
    const items = await this.validateAndNormalizeSaleItems(dto.branchId, dto.items);
    const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
    const selections: BatchSelectionResult[] = items.map((item) => ({
      productId: item.productId,
      selectedBatches: [],
      totalQuantity: item.quantityInBaseUnits ?? item.quantity,
      totalAmount: item.unitPrice * item.quantity,
      unitPrice: item.unitPrice,
      packSize: item.packSize,
      originalQuantity: item.quantity,
    }));
    const { discount, manualDiscount } = await this.calculateServerDiscount(
      dto as CreateSaleDto,
      selections,
      subtotal,
    );
    const { taxAmount, taxBreakdown } = await this.calculateTaxes(
      items,
      subtotal,
      discount,
    );
    return {
      subtotal,
      discount,
      manualDiscount,
      taxAmount,
      taxBreakdown,
      total: Math.max(0, subtotal - discount + taxAmount),
    };
  }

  /**
   * Process checkout with product-level stock selection and transaction
   * Requirements: 5.1, 5.2, 5.3, 17.1
   * Properties: 19 (FEFO batch selection), 20 (Multi-batch FEFO), 21 (Expired batch exclusion)
   * Property 28: Sales require open shift
   */
async processCheckout(
    dto: CreateSaleDto,
    actor: CurrentUserData,
  ): Promise<CheckoutResult> {
    const cashierId = actor.userId;
    if (
      actor.role !== UserRole.SUPER_ADMIN &&
      (!actor.branchId || actor.branchId !== dto.branchId)
    ) {
      throw new BadRequestException('Checkout is restricted to your assigned branch');
    }
    try {
      // Validate shift is open (Property 28)
      const shift = await this.shiftsService.findById(dto.shiftId);
      if (!shift) {
        throw new BadRequestException(`Shift with ID ${dto.shiftId} not found`);
      }

      const canAcceptSales = await this.shiftsService.canAcceptSales(dto.shiftId);
      if (!canAcceptSales) {
        throw new BadRequestException(
          'Shift is not open. Cannot process sales on a closed shift.',
        );
      }
      if (
        shift.branchId.toString() !== dto.branchId ||
        shift.cashierId.toString() !== cashierId ||
        shift.terminalId !== dto.terminalId
      ) {
        throw new BadRequestException(
          'The selected shift does not belong to this cashier, branch, and terminal',
        );
      }
    } catch (shiftError) {
      this.logger.error(`Shift validation failed: ${shiftError instanceof Error ? shiftError.message : 'Unknown error'}`);
      throw shiftError;
    }

    // Validate items
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('Sale must contain at least one item');
    }

    dto.items = await this.validateAndNormalizeSaleItems(dto.branchId, dto.items);

    // Calculate totals (will be recalculated inside the transaction)
    let receiptNumber: string;
    try {
      // Generate receipt number
      receiptNumber = await this.salesRepository.generateReceiptNumber(
        dto.branchId,
      );
    } catch (receiptError) {
      this.logger.error(`Receipt number generation failed: ${receiptError instanceof Error ? receiptError.message : 'Unknown error'}`);
      throw new BadRequestException('Failed to generate receipt number. Please try again.');
    }

let session;
    try {
      // Execute checkout in a transaction
      session = await this.connection.startSession();
      session.startTransaction();

      // Use FEFO batch selection inside transaction (C7: prevents race conditions)
      const batchSelections = await this.selectBatchesForItems(
        dto.branchId,
        dto.items,
        session,
      );

      const subtotal = batchSelections.reduce(
        (sum, selection) => sum + selection.totalAmount,
        0,
      );
      const { discount, manualDiscount } = await this.calculateServerDiscount(
        dto,
        batchSelections,
        subtotal,
      );
      const { taxAmount, taxBreakdown } = await this.calculateTaxes(
        dto.items,
        subtotal,
        discount,
      );
      const total = Math.max(0, subtotal - discount + taxAmount);

      if (total < 0) {
        throw new BadRequestException('Discount cannot exceed subtotal');
      }

      const saleItems = this.buildSaleItems(batchSelections);

      const saleType =
        dto.saleType ??
        (dto.paymentMethod === PaymentMethod.CREDIT
          ? SaleType.CREDIT
          : SaleType.CASH);
      const amountPaid =
        saleType === SaleType.CASH ? total : (dto.amountPaid ?? 0);
      const balanceDue = Math.max(0, total - amountPaid);
      const paymentStatus =
        balanceDue <= 0
          ? PaymentStatus.PAID
          : amountPaid > 0
            ? PaymentStatus.PARTIAL
            : PaymentStatus.UNPAID;

      this.validatePaymentDetails(dto, total, saleType, amountPaid, balanceDue);
      const payments = this.buildInitialPayments(dto, cashierId, saleType, amountPaid, balanceDue, receiptNumber);

      // Determine prescription status
      const prescriptionStatus = dto.prescriptionUrl
        ? PrescriptionStatus.PENDING
        : undefined;

      // Create the sale record
      // Property 6: Payment method persistence
      // Property 13: Mobile money reference storage
      // Property 15: Optional mobile money reference
      const sale = await this.salesRepository.create(
        {
          branchId: dto.branchId,
          shiftId: dto.shiftId,
          terminalId: dto.terminalId,
          cashierId,
          items: saleItems,
          subtotal,
          discount,
          manualDiscount,
          manualDiscountBy: manualDiscount > 0 ? new Types.ObjectId(cashierId) : undefined,
          manualDiscountAt: manualDiscount > 0 ? new Date() : undefined,
          promotionId: dto.promotionId ? new Types.ObjectId(dto.promotionId) : undefined,
          taxAmount,
          taxBreakdown,
          total,
          saleType,
          paymentMethod: dto.paymentMethod, // Property 6: Validated and persisted
          paymentStatus,
          amountPaid,
          balanceDue,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
          payments,
          paymentReference: dto.paymentReference, // Property 13, 15: Optional mobile money reference
          prescriptionUrl: dto.prescriptionUrl,
          prescriptionStatus,
          customerName: dto.customerName,
          customerPhone: dto.customerPhone,
          customerId: dto.customerId ? new Types.ObjectId(dto.customerId) : undefined,
          patientId: dto.patientId,
          patientName: dto.patientName,
          sourceSystem: dto.sourceSystem,
          notes: dto.notes,
          receiptNumber,
        },
        session,
      );

// Update batch quantities and create stock movements
      await this.processBatchUpdatesFromSelections(
        dto.branchId,
        batchSelections,
        cashierId,
        sale._id.toString(),
        session,
      );

      if (dto.promotionId) {
        await this.promotionsService.applyPromotion(dto.promotionId, session);
      }

      await session.commitTransaction();
      this.logger.log(`Checkout completed: ${receiptNumber}`);

      if (manualDiscount > 0) {
        await this.auditService.logUpdate(
          actor.userId,
          actor.username,
          AuditResource.SALE,
          sale._id.toString(),
          { manualDiscount: 0 },
          { manualDiscount, totalDiscount: discount, saleTotal: total },
          dto.branchId,
          {
            event: 'manual_discount_applied',
            receiptNumber,
            subtotal,
            manualDiscount,
            discountPercent: subtotal > 0
              ? Math.round((manualDiscount / subtotal) * 10000) / 100
              : 0,
            promotionId: dto.promotionId,
            cashierId,
            terminalId: dto.terminalId,
          },
        ).catch((error: unknown) => {
          this.logger.error(
            `Manual discount audit failed for ${receiptNumber}: ${error instanceof Error ? error.message : String(error)}`,
          );
        });
      }

      // Emit sale event as a non-blocking side-effect. If websocket/redis is
      // temporarily unavailable, checkout must still succeed.
      try {
        this.eventsService.emitSaleUpdate({
          saleId: sale._id.toString(),
          branchId: dto.branchId,
          shiftId: dto.shiftId,
          total,
          paymentMethod: dto.paymentMethod,
          paymentReference: dto.paymentReference,
          items: saleItems.map((item) => ({
            productId: item.productId.toString(),
            quantity: item.quantity,
          })),
          updateType: 'completed',
          timestamp: new Date(),
        });
      } catch (emitError) {
        const emitMessage =
          emitError instanceof Error ? emitError.message : 'Unknown emit error';
        this.logger.warn(
          `Checkout completed but sale event emit failed: ${emitMessage}`,
        );
      }

      return {
        sale,
        receiptNumber,
        itemsProcessed: dto.items.length,
        totalAmount: total,
      };
    } catch (error) {
      if (session) {
        try {
          await session.abortTransaction();
        } catch (abortError) {
          this.logger.warn(`Failed to abort transaction: ${abortError instanceof Error ? abortError.message : 'Unknown'}`);
        }
      }
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Checkout failed: ${errorMessage}`, errorStack);
      throw error;
    } finally {
      if (session) {
        try {
          await session.endSession();
        } catch (endError) {
          this.logger.warn(`Failed to end session: ${endError instanceof Error ? endError.message : 'Unknown'}`);
        }
      }
    }
  }

/**
   * Select batches for all items using FEFO
   * Supports pack sizes: calculates quantityInBaseUnits from packSize if not provided
   * Properties: 19, 20, 21
   */
  private async selectBatchesForItems(
    branchId: string,
    items: SaleItemDto[],
    _session: ClientSession,
  ): Promise<BatchSelectionResult[]> {
    const results: BatchSelectionResult[] = [];

    for (const item of items) {
      // Calculate quantityInBaseUnits from packSize if not provided
      let quantityNeeded = item.quantityInBaseUnits;
      if (quantityNeeded === undefined || quantityNeeded === null) {
        if (item.packSize) {
          quantityNeeded = item.quantity * item.packSize.quantityPerPack;
        } else {
          quantityNeeded = item.quantity;
        }
      }

      // Use FEFO batch selection from BatchesService
      const selectedBatches = await this.batchesService.selectBatchesForSale({
        branchId,
        productId: item.productId,
        quantityNeeded,
      });

      // Verify we have enough stock
      const totalSelected = selectedBatches.reduce((sum, b) => sum + b.quantity, 0);
      if (totalSelected < quantityNeeded) {
        throw new BadRequestException(
          `Insufficient stock for product ${item.productId}. Requested: ${quantityNeeded}, Available: ${totalSelected}`,
        );
      }

      // Calculate total amount using the item's unitPrice (already accounts for pack size pricing)
      const totalAmount = item.unitPrice * item.quantity;

      results.push({
        productId: item.productId,
        selectedBatches,
        totalQuantity: quantityNeeded,
        totalAmount,
        unitPrice: item.unitPrice,
        packSize: item.packSize,
        originalQuantity: item.quantity,
      });
    }

    return results;
  }

  private async validateAndNormalizeSaleItems(
    branchId: string,
    items: SaleItemDto[],
  ): Promise<SaleItemDto[]> {
    return Promise.all(
      items.map(async (item) => {
        const product = await this.productModel.findById(item.productId).exec();
        if (!product) {
          throw new BadRequestException(`Product ${item.productId} was not found`);
        }

        if (String(product.branchId) !== branchId) {
          throw new BadRequestException(
            `Product ${product.name} does not belong to this branch`,
          );
        }

        const normalized: SaleItemDto = { ...item };
        if (item.packSize) {
          const matchedPack = product.packSizes.find((pack) =>
            this.isSamePackSize(pack, item.packSize!),
          );

          if (!matchedPack) {
            throw new BadRequestException(
              `Pack size ${item.packSize.name} is not configured for ${product.name}`,
            );
          }

          normalized.packSize = {
            code: matchedPack.code,
            name: matchedPack.name,
            unit: matchedPack.unit,
            quantityPerPack: matchedPack.quantityPerPack,
            barcode: matchedPack.barcode,
          };
          normalized.unitPrice = matchedPack.sellingPrice;
          normalized.quantityInBaseUnits =
            normalized.quantity * matchedPack.quantityPerPack;
        } else {
          normalized.unitPrice =
            product.suggestedRetailPrice > 0
              ? product.suggestedRetailPrice
              : product.basePrice;
          normalized.quantityInBaseUnits = normalized.quantity;
        }

        if ((product.quantityAvailable ?? 0) < normalized.quantityInBaseUnits!) {
          throw new BadRequestException(
            `Insufficient stock for ${product.name}. Requested ${normalized.quantityInBaseUnits}, available ${product.quantityAvailable ?? 0}`,
          );
        }

        return normalized;
      }),
    );
  }

  private isSamePackSize(
    configuredPack: Product['packSizes'][number],
    requestedPack: SaleItemPackSizeDto,
  ): boolean {
    if (requestedPack.code && configuredPack.code === requestedPack.code) {
      return true;
    }

    if (requestedPack.barcode && configuredPack.barcode === requestedPack.barcode) {
      return true;
    }

    return (
      configuredPack.unit === requestedPack.unit &&
      configuredPack.quantityPerPack === requestedPack.quantityPerPack
    );
  }

  private async calculateServerDiscount(
    dto: CreateSaleDto,
    selections: BatchSelectionResult[],
    subtotal: number,
  ): Promise<{ discount: number; manualDiscount: number }> {
    const requestedManualDiscount = Math.min(
      Math.max(0, dto.discount ?? 0),
      subtotal,
    );
    if (!dto.promotionId) {
      return {
        discount: Math.round(requestedManualDiscount * 100) / 100,
        manualDiscount: Math.round(requestedManualDiscount * 100) / 100,
      };
    }

    const products = await this.productModel
      .find({
        _id: { $in: selections.map((item) => new Types.ObjectId(item.productId)) },
      })
      .select('_id category')
      .lean()
      .exec();
    const categoryByProduct = new Map(
      products.map((product) => [product._id.toString(), product.category]),
    );
    const result = await this.promotionsService.calculateDiscount(
      dto.promotionId,
      selections.map((item) => ({
        productId: item.productId,
        quantity: item.originalQuantity,
        unitPrice: item.unitPrice,
        category: categoryByProduct.get(item.productId),
      })),
      subtotal,
      dto.branchId,
    );
    const promotionDiscount = Math.min(result.discountAmount, subtotal);
    const manualDiscount = Math.min(
      requestedManualDiscount,
      Math.max(0, subtotal - promotionDiscount),
    );
    return {
      discount: Math.round((promotionDiscount + manualDiscount) * 100) / 100,
      manualDiscount: Math.round(manualDiscount * 100) / 100,
    };
  }

  private async calculateTaxes(
    items: SaleItemDto[],
    subtotal: number,
    discount: number,
  ): Promise<{
    taxAmount: number;
    taxBreakdown: Array<{ name: string; amount: number }>;
  }> {
    const taxes = await this.taxConfigModel.find({ isActive: true }).lean().exec();
    if (taxes.length === 0 || subtotal <= 0) {
      return { taxAmount: 0, taxBreakdown: [] };
    }

    const products = await this.productModel
      .find({ _id: { $in: items.map((item) => new Types.ObjectId(item.productId)) } })
      .select('_id category')
      .lean()
      .exec();
    const categoryByProduct = new Map(
      products.map((product) => [product._id.toString(), product.category]),
    );
    const taxableRatio = Math.max(0, (subtotal - discount) / subtotal);
    const taxBreakdown = taxes
      .map((tax) => {
        const eligibleSubtotal = items.reduce((sum, item) => {
          const category = categoryByProduct.get(item.productId);
          const applies =
            tax.applicableCategories.length === 0 ||
            (category ? tax.applicableCategories.includes(category) : false);
          return applies ? sum + item.unitPrice * item.quantity : sum;
        }, 0) * taxableRatio;
        const rawAmount = tax.type === TaxType.PERCENTAGE
          ? eligibleSubtotal * tax.rate / 100
          : eligibleSubtotal > 0 ? tax.rate : 0;
        return { name: tax.name, amount: Math.round(rawAmount * 100) / 100 };
      })
      .filter((tax) => tax.amount > 0);

    return {
      taxAmount:
        Math.round(taxBreakdown.reduce((sum, tax) => sum + tax.amount, 0) * 100) /
        100,
      taxBreakdown,
    };
  }

  /**
   * Build sale items from batch selections
   * Preserves pack size info for receipt display and returns
   */
  private buildSaleItems(selections: BatchSelectionResult[]): SaleItem[] {
    const saleItems: SaleItem[] = [];

    for (const selection of selections) {
      for (const batch of selection.selectedBatches) {
        saleItems.push({
          saleItemId: new Types.ObjectId().toString(),
          productId: new Types.ObjectId(selection.productId),
          batchId: new Types.ObjectId(batch.batchId),
          quantity: batch.quantity,
          unitPrice: selection.unitPrice,
          subtotal:
            batch.quantity * (selection.totalAmount / selection.totalQuantity),
          packSize: selection.packSize
            ? {
                code: selection.packSize.code,
                name: selection.packSize.name,
                unit: selection.packSize.unit,
                quantityPerPack: selection.packSize.quantityPerPack,
                barcode: selection.packSize.barcode,
              }
            : undefined,
          returnedQuantity: 0,
        });
      }
    }

    return saleItems;
  }

  private validatePaymentDetails(
    dto: CreateSaleDto,
    total: number,
    saleType: SaleType,
    amountPaid: number,
    balanceDue: number,
  ): void {
    if (amountPaid < 0 || amountPaid > total) {
      throw new BadRequestException('Amount paid must be between 0 and total');
    }

    if (saleType === SaleType.CREDIT) {
      if (dto.paymentMethod !== PaymentMethod.CREDIT) {
        throw new BadRequestException(
          'Credit sales must use the credit payment method',
        );
      }

      if (!dto.dueDate) {
        throw new BadRequestException('Due date is required for credit sales');
      }

      const dueDate = new Date(dto.dueDate);
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      if (dueDate < startOfToday) {
        throw new BadRequestException('Due date cannot be in the past');
      }

      if (amountPaid > 0 && !dto.initialPaymentMethod) {
        throw new BadRequestException(
          'Initial payment method is required when recording a deposit',
        );
      }

      if (dto.initialPaymentMethod === PaymentMethod.CREDIT) {
        throw new BadRequestException(
          'Initial payment method cannot be credit',
        );
      }
    } else {
      if (dto.paymentMethod === PaymentMethod.CREDIT) {
        throw new BadRequestException(
          'Credit payment method can only be used for credit sales',
        );
      }

      if (balanceDue > 0) {
        throw new BadRequestException(
          'Cash sales must be fully paid at checkout',
        );
      }
    }
  }

  private buildInitialPayments(
    dto: CreateSaleDto,
    cashierId: string,
    saleType: SaleType,
    amountPaid: number,
    balanceDue: number,
    receiptNumber: string,
  ): SalePaymentEntry[] {
    if (amountPaid <= 0) {
      return [];
    }

    const paymentMethod =
      saleType === SaleType.CREDIT
        ? dto.initialPaymentMethod!
        : dto.paymentMethod;

    return [
      {
        paymentReceiptNumber: `${receiptNumber}-PAY-01`,
        amount: amountPaid,
        paymentMethod,
        paymentReference: dto.paymentReference,
        receivedBy: new Types.ObjectId(cashierId),
        receivedAt: new Date(),
        notes:
          saleType === SaleType.CREDIT
            ? 'Initial credit-sale payment'
            : 'Checkout payment',
        isInitialPayment: true,
        balanceAfterPayment: balanceDue,
      },
    ];
  }

/**
   * Process batch quantity updates and stock movements using FEFO selections
   * Requirements: 5.3, 17.1, 19, 20
   */
  private async processBatchUpdatesFromSelections(
    branchId: string,
    selections: BatchSelectionResult[],
    userId: string,
    saleId: string,
    session: ClientSession,
  ): Promise<void> {
    for (const selection of selections) {
      for (const batch of selection.selectedBatches) {
        // Decrement batch quantity (atomic with stock check)
        await this.batchesRepository.updateQuantity(
          batch.batchId,
          -batch.quantity,
          session,
        );

        // Record stock movement
        await this.inventoryService.recordSaleMovement(
          branchId,
          selection.productId,
          batch.quantity,
          userId,
          saleId,
          session,
        );
      }

      // Also update product-level quantityAvailable for consistency
      const totalQuantity = selection.selectedBatches.reduce(
        (sum, b) => sum + b.quantity,
        0,
      );
      const updated = await this.productModel
        .findOneAndUpdate(
          {
            _id: new Types.ObjectId(selection.productId),
            branchId: new Types.ObjectId(branchId),
            quantityAvailable: { $gte: totalQuantity },
          },
          { $inc: { quantityAvailable: -totalQuantity } },
          { session },
        )
        .exec();

      if (!updated) {
        throw new BadRequestException(
          `Insufficient product-level stock for ${selection.productId}: need ${totalQuantity} units`,
        );
      }
    }
  }

/**
   * Check stock availability for items without creating a sale
   * Useful for cart validation before checkout
   */
  async checkStockAvailability(
    branchId: string,
    items: SaleItemDto[],
  ): Promise<{
    available: boolean;
    unavailableItems: Array<{
      productId: string;
      requested: number;
      available: number;
    }>;
  }> {
    const unavailableItems: Array<{
      productId: string;
      requested: number;
      available: number;
    }> = [];

    for (const item of items) {
      const product = await this.productModel
        .findOne({
          _id: new Types.ObjectId(item.productId),
          branchId: new Types.ObjectId(branchId),
        })
        .exec();
      const requestedQuantity = item.quantityInBaseUnits ?? item.quantity;
      const availableQuantity = product?.quantityAvailable ?? 0;

      if (availableQuantity < requestedQuantity) {
        unavailableItems.push({
          productId: item.productId,
          requested: requestedQuantity,
          available: availableQuantity,
        });
      }
    }

    return {
      available: unavailableItems.length === 0,
      unavailableItems,
    };
  }
}
