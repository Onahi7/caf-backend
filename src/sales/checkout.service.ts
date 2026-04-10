import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, ClientSession, Types } from 'mongoose';
import { SalesRepository } from './sales.repository.js';
import { BatchesService } from '../batches/batches.service.js';
import { BatchesRepository } from '../batches/batches.repository.js';
import { InventoryService } from '../inventory/inventory.service.js';
import { ShiftsService } from '../shifts/shifts.service.js';
import { ProductsService } from '../products/products.service.js';
import { CreateSaleDto, SaleItemDto } from './dto/create-sale.dto.js';
import {
  SaleDocument,
  SaleItem,
  PrescriptionStatus,
} from './schemas/sale.schema.js';
import { SelectedBatch } from '../batches/dto/batch-selection.dto.js';
import { EventsService } from '../websocket/events.service.js';

/**
 * Result of batch selection for a sale item
 */
interface BatchSelectionResult {
  productId: string;
  selectedBatches: SelectedBatch[];
  totalQuantity: number;
  totalAmount: number;
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
 * Handles checkout processing with FEFO batch selection and MongoDB transactions
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
    private readonly productsService: ProductsService,
    private readonly eventsService: EventsService,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  /**
   * Process checkout with FEFO batch selection and transaction
   * Requirements: 5.1, 5.2, 5.3, 17.1
   * Properties: 19 (FEFO batch selection), 20 (Multi-batch FEFO), 21 (Expired batch exclusion)
   * Property 28: Sales require open shift
   * Property 79: Prescription requirement enforcement
   */
  async processCheckout(
    dto: CreateSaleDto,
    cashierId: string,
  ): Promise<CheckoutResult> {
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

    // Validate items
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('Sale must contain at least one item');
    }

    // Check prescription requirements (Property 79)
    await this.validatePrescriptionRequirements(dto.items, dto.prescriptionUrl);

    // Select batches for all items using FEFO
    const batchSelections = await this.selectBatchesForItems(
      dto.branchId,
      dto.items,
    );

    // Calculate totals
    const subtotal = batchSelections.reduce(
      (sum, selection) => sum + selection.totalAmount,
      0,
    );
    const discount = dto.discount || 0;
    const total = subtotal - discount;

    if (total < 0) {
      throw new BadRequestException('Discount cannot exceed subtotal');
    }

    // Generate receipt number
    const receiptNumber = await this.salesRepository.generateReceiptNumber(
      dto.branchId,
    );

    // Execute checkout in a transaction
    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      // Build sale items from batch selections
      const saleItems = this.buildSaleItems(batchSelections);

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
          total,
          paymentMethod: dto.paymentMethod, // Property 6: Validated and persisted
          paymentReference: dto.paymentReference, // Property 13, 15: Optional mobile money reference
          prescriptionUrl: dto.prescriptionUrl,
          prescriptionStatus,
          customerName: dto.customerName,
          customerPhone: dto.customerPhone,
          notes: dto.notes,
          receiptNumber,
        },
        session,
      );

      // Update batch quantities and create stock movements
      await this.processBatchUpdates(
        dto.branchId,
        batchSelections,
        cashierId,
        sale._id.toString(),
        session,
      );

      await session.commitTransaction();
      this.logger.log(`Checkout completed: ${receiptNumber}`);

      // Emit sale completed event after successful transaction
      this.eventsService.emitSaleUpdate({
        saleId: sale._id.toString(),
        branchId: dto.branchId,
        shiftId: dto.shiftId,
        total,
        paymentMethod: dto.paymentMethod,
        paymentReference: dto.paymentReference,
        items: saleItems.map((item) => ({
          productId: item.productId.toString(),
          batchId: item.batchId.toString(),
          quantity: item.quantity,
        })),
        updateType: 'completed',
        timestamp: new Date(),
      });

      return {
        sale,
        receiptNumber,
        itemsProcessed: dto.items.length,
        totalAmount: total,
      };
    } catch (error) {
      await session.abortTransaction();
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Checkout failed: ${errorMessage}`, errorStack);
      throw error;
    } finally {
      await session.endSession();
    }
  }

  /**
   * Validate prescription requirements for items
   * Property 79: Prescription requirement enforcement
   */
  private async validatePrescriptionRequirements(
    items: SaleItemDto[],
    prescriptionUrl?: string,
  ): Promise<void> {
    for (const item of items) {
      const product = await this.productsService.findById(item.productId);

      if (product.requiresPrescription && !prescriptionUrl) {
        throw new BadRequestException(
          `Product "${product.name}" requires a prescription. Please attach a prescription to complete this sale.`,
        );
      }
    }
  }

  /**
   * Select batches for all items using FEFO
   * Properties: 19, 20, 21
   */
  private async selectBatchesForItems(
    branchId: string,
    items: SaleItemDto[],
  ): Promise<BatchSelectionResult[]> {
    const results: BatchSelectionResult[] = [];

    for (const item of items) {
      // Use FEFO batch selection from BatchesService
      const selectedBatches = await this.batchesService.selectBatchesForSale({
        branchId,
        productId: item.productId,
        quantityNeeded: item.quantity,
      });

      // Calculate total amount for this item
      const totalAmount = selectedBatches.reduce(
        (sum, batch) => sum + batch.quantity * batch.sellingPrice,
        0,
      );

      results.push({
        productId: item.productId,
        selectedBatches,
        totalQuantity: item.quantity,
        totalAmount,
      });
    }

    return results;
  }

  /**
   * Build sale items from batch selections
   */
  private buildSaleItems(selections: BatchSelectionResult[]): SaleItem[] {
    const saleItems: SaleItem[] = [];

    for (const selection of selections) {
      for (const batch of selection.selectedBatches) {
        saleItems.push({
          productId: new Types.ObjectId(selection.productId),
          batchId: new Types.ObjectId(batch.batchId),
          quantity: batch.quantity,
          unitPrice: batch.sellingPrice,
          subtotal: batch.quantity * batch.sellingPrice,
          lotNumber: batch.lotNumber,
          expiryDate: batch.expiryDate,
          returnedQuantity: 0,
        });
      }
    }

    return saleItems;
  }

  /**
   * Process batch quantity updates and stock movements
   * Requirements: 5.3, 17.1
   */
  private async processBatchUpdates(
    branchId: string,
    selections: BatchSelectionResult[],
    userId: string,
    saleId: string,
    session: ClientSession,
  ): Promise<void> {
    for (const selection of selections) {
      for (const batch of selection.selectedBatches) {
        // Decrement batch quantity
        await this.batchesRepository.updateQuantity(
          batch.batchId,
          -batch.quantity,
          session,
        );

        // Create stock movement record
        await this.inventoryService.recordSaleMovement(
          branchId,
          selection.productId,
          batch.batchId,
          batch.quantity,
          userId,
          saleId,
          session,
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
      const availableQuantity = await this.batchesService.getAvailableQuantity(
        branchId,
        item.productId,
      );

      if (availableQuantity < item.quantity) {
        unavailableItems.push({
          productId: item.productId,
          requested: item.quantity,
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
