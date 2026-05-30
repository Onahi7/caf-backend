import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { PurchasesRepository } from './purchases.repository.js';
import { InventoryService } from '../inventory/inventory.service.js';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto.js';
import { ReceivePurchaseOrderDto } from './dto/receive-purchase-order.dto.js';
import { PurchaseOrderFilterDto } from './dto/purchase-order-filter.dto.js';
import {
  PurchaseOrderDocument,
  PurchaseOrderStatus,
} from './schemas/purchase-order.schema.js';
import { Product, ProductDocument } from '../products/schemas/product.schema.js';

/**
 * Result of receiving a purchase order
 */
export interface ReceiveResult {
  purchaseOrder: PurchaseOrderDocument;
  productsUpdated: number;
  movementsCreated: number;
  isPartialReceipt: boolean;
}

/**
 * PurchaseService
 * Handles purchase order creation and product-level stock receiving
 * Requirements: 19.1, 19.2, 19.4
 * Properties: 71, 72, 73, 74
 */
@Injectable()
export class PurchasesService {
  private readonly logger = new Logger(PurchasesService.name);

  constructor(
    private readonly purchasesRepository: PurchasesRepository,
    private readonly inventoryService: InventoryService,
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Product.name) private readonly productModel: Model<ProductDocument>,
  ) {}

  /**
   * Create a new purchase order
   * Property 71: Purchase order structure
   * Requirements: 19.1
   */
  async create(
    createPurchaseOrderDto: CreatePurchaseOrderDto,
  ): Promise<PurchaseOrderDocument> {
    // Validate items array is not empty
    if (
      !createPurchaseOrderDto.items ||
      createPurchaseOrderDto.items.length === 0
    ) {
      throw new BadRequestException(
        'Purchase order must contain at least one item',
      );
    }

    return this.purchasesRepository.create(createPurchaseOrderDto);
  }

  async findAll(): Promise<PurchaseOrderDocument[]> {
    return this.purchasesRepository.findAll();
  }

  async findById(id: string): Promise<PurchaseOrderDocument> {
    const purchaseOrder = await this.purchasesRepository.findById(id);
    if (!purchaseOrder) {
      throw new NotFoundException(`Purchase order with ID ${id} not found`);
    }
    return purchaseOrder;
  }

  async findByOrderNumber(orderNumber: string): Promise<PurchaseOrderDocument> {
    const purchaseOrder =
      await this.purchasesRepository.findByOrderNumber(orderNumber);
    if (!purchaseOrder) {
      throw new NotFoundException(
        `Purchase order with order number ${orderNumber} not found`,
      );
    }
    return purchaseOrder;
  }

  async findByFilter(
    filter: PurchaseOrderFilterDto,
  ): Promise<PurchaseOrderDocument[]> {
    return this.purchasesRepository.findByFilter(filter);
  }

  async findByBranch(branchId: string): Promise<PurchaseOrderDocument[]> {
    return this.purchasesRepository.findByBranch(branchId);
  }

  async findBySupplier(supplierId: string): Promise<PurchaseOrderDocument[]> {
    return this.purchasesRepository.findBySupplier(supplierId);
  }

  async findPending(): Promise<PurchaseOrderDocument[]> {
    return this.purchasesRepository.findPending();
  }

  /**
   * Receive items from a purchase order
   * Updates product stock and stock movements for received items
   * Supports partial receipt
   *
   * Property 72: PO receiving increases available stock
   * Property 73: PO status tracking
   * Property 74: Partial PO receipt
   * Requirements: 19.2, 19.4
   */
  async receivePurchaseOrder(
    id: string,
    receiveDto: ReceivePurchaseOrderDto,
  ): Promise<ReceiveResult> {
    const purchaseOrder = await this.findById(id);

    // Validate PO status
    if (purchaseOrder.status === PurchaseOrderStatus.COMPLETED) {
      throw new BadRequestException(
        'Purchase order has already been fully received',
      );
    }

    if (purchaseOrder.status === PurchaseOrderStatus.CANCELLED) {
      throw new BadRequestException(
        'Cannot receive a cancelled purchase order',
      );
    }

    // Validate received items match PO items
    for (const receivedItem of receiveDto.receivedItems) {
      const poItem = purchaseOrder.items.find(
        (item) => item.productId.toString() === receivedItem.productId,
      );

      if (!poItem) {
        throw new BadRequestException(
          `Product ${receivedItem.productId} is not in this purchase order`,
        );
      }

      const remainingQuantity = poItem.quantity - poItem.receivedQuantity;
      if (receivedItem.receivedQuantity > remainingQuantity) {
        throw new BadRequestException(
          `Cannot receive more than ordered. Product ${receivedItem.productId}: ordered ${poItem.quantity}, already received ${poItem.receivedQuantity}, trying to receive ${receivedItem.receivedQuantity}`,
        );
      }
    }

    // Start transaction
    const session = await this.connection.startSession();
    session.startTransaction();

    let productsUpdated = 0;
    let movementsCreated = 0;

    try {
      // Process each received item
      for (const receivedItem of receiveDto.receivedItems) {
        // Find the PO item to get the purchase price
        const poItem = purchaseOrder.items.find(
          (item) => item.productId.toString() === receivedItem.productId,
        );

        // Try to find existing product at this branch
        let updatedProduct = await this.productModel
          .findOneAndUpdate(
            {
              _id: new Types.ObjectId(receivedItem.productId),
              branchId: purchaseOrder.branchId,
            },
            {
              $inc: { quantityAvailable: receivedItem.receivedQuantity },
              $set: {
                supplierId: purchaseOrder.supplierId,
                supplyDate: receivedItem.supplyDate
                  ? new Date(receivedItem.supplyDate)
                  : new Date(),
                expiryDate: receivedItem.expiryDate
                  ? new Date(receivedItem.expiryDate)
                  : undefined,
                costPrice: receivedItem.purchasePrice ?? poItem!.unitPrice,
                suggestedRetailPrice: receivedItem.sellingPrice,
                basePrice: receivedItem.sellingPrice,
              },
            },
            { new: true, session },
          )
          .exec();

        // If product doesn't exist at this branch, create it
        if (!updatedProduct) {
          const sourceProduct = await this.productModel.findById(receivedItem.productId).lean().exec();
          
          if (sourceProduct) {
            // Create a copy of the product for this branch
            const newProductData = {
              branchId: new Types.ObjectId(purchaseOrder.branchId.toString()),
              name: sourceProduct.name,
              sku: sourceProduct.sku,
              barcode: sourceProduct.barcode || `BAR-${Date.now()}`,
              category: sourceProduct.category || 'general',
              brand: sourceProduct.brand || 'Unknown',
              unit: sourceProduct.unit || 'unit',
              reorderLevel: sourceProduct.reorderLevel || 0,
              maxStockLevel: sourceProduct.maxStockLevel || 0,
              quantityAvailable: receivedItem.receivedQuantity,
              quantityInitial: receivedItem.receivedQuantity,
              basePrice: receivedItem.sellingPrice || 0,
              costPrice: (receivedItem.purchasePrice ?? poItem!.unitPrice) || 0,
              suggestedRetailPrice: receivedItem.sellingPrice || 0,
              markupPercentage: 0,
              requiresPrescription: sourceProduct.requiresPrescription || false,
              isControlled: sourceProduct.isControlled || false,
              packSizes: sourceProduct.packSizes || [],
              supplierId: purchaseOrder.supplierId,
              supplyDate: receivedItem.supplyDate ? new Date(receivedItem.supplyDate) : new Date(),
              expiryDate: receivedItem.expiryDate ? new Date(receivedItem.expiryDate) : undefined,
              isActive: true,
            };

            const [created] = await this.productModel.create([newProductData], { session });
            updatedProduct = created;
            this.logger.log(`Auto-created product "${sourceProduct.name}" at branch ${purchaseOrder.branchId}`);
          } else {
            // Source product also doesn't exist — create a minimal product
            const minimalProduct = {
              branchId: new Types.ObjectId(purchaseOrder.branchId.toString()),
              name: `Product ${receivedItem.productId}`,
              sku: `SKU-${Date.now()}`,
              barcode: `BAR-${Date.now()}`,
              category: 'general',
              brand: 'Unknown',
              unit: 'unit',
              reorderLevel: 0,
              maxStockLevel: 0,
              quantityAvailable: receivedItem.receivedQuantity,
              quantityInitial: receivedItem.receivedQuantity,
              basePrice: receivedItem.sellingPrice || 0,
              costPrice: receivedItem.purchasePrice ?? 0,
              suggestedRetailPrice: receivedItem.sellingPrice || 0,
              markupPercentage: 0,
              requiresPrescription: false,
              isControlled: false,
              packSizes: [],
              supplierId: purchaseOrder.supplierId,
              supplyDate: receivedItem.supplyDate ? new Date(receivedItem.supplyDate) : new Date(),
              expiryDate: receivedItem.expiryDate ? new Date(receivedItem.expiryDate) : undefined,
              isActive: true,
            };

            const [created] = await this.productModel.create([minimalProduct], { session });
            updatedProduct = created;
            this.logger.log(`Auto-created minimal product at branch ${purchaseOrder.branchId}`);
          }
        }

        productsUpdated++;

        // Create stock movement for the purchase
        await this.inventoryService.recordPurchaseMovement(
          purchaseOrder.branchId.toString(),
          updatedProduct._id.toString(),
          receivedItem.receivedQuantity,
          receiveDto.receivedBy,
          id,
          session,
        );
        movementsCreated++;

        // Update received quantity in PO
        const newReceivedQuantity =
          poItem!.receivedQuantity + receivedItem.receivedQuantity;
        await this.purchasesRepository.updateItemReceivedQuantity(
          id,
          receivedItem.productId,
          newReceivedQuantity,
          session,
        );
      }

      // Determine new status
      const updatedPO = await this.purchasesRepository.findById(id, session);
      const isFullyReceived = updatedPO!.items.every(
        (item) => item.receivedQuantity >= item.quantity,
      );

      const newStatus = isFullyReceived
        ? PurchaseOrderStatus.COMPLETED
        : PurchaseOrderStatus.PARTIALLY_RECEIVED;

      await this.purchasesRepository.updateStatus(id, newStatus, session);

      await session.commitTransaction();

      // Fetch final state
      const finalPO = await this.findById(id);

      return {
        purchaseOrder: finalPO,
        productsUpdated,
        movementsCreated,
        isPartialReceipt: !isFullyReceived,
      };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      await session.endSession();
    }
  }

  /**
   * Cancel a purchase order
   * Property 73: PO status tracking
   */
  async cancel(id: string): Promise<PurchaseOrderDocument> {
    const purchaseOrder = await this.findById(id);

    if (purchaseOrder.status === PurchaseOrderStatus.COMPLETED) {
      throw new BadRequestException('Cannot cancel a completed purchase order');
    }

    if (purchaseOrder.status === PurchaseOrderStatus.PARTIALLY_RECEIVED) {
      throw new BadRequestException(
        'Cannot cancel a partially received purchase order',
      );
    }

    const cancelled = await this.purchasesRepository.cancel(id);
    if (!cancelled) {
      throw new NotFoundException(`Purchase order with ID ${id} not found`);
    }

    return cancelled;
  }

  /**
   * Delete a purchase order (only if pending)
   */
  async delete(id: string): Promise<void> {
    const purchaseOrder = await this.findById(id);

    if (purchaseOrder.status !== PurchaseOrderStatus.PENDING) {
      throw new BadRequestException('Can only delete pending purchase orders');
    }

    await this.purchasesRepository.delete(id);
  }
}
