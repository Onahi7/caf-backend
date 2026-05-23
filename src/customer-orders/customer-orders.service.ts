import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CustomerOrdersRepository } from './customer-orders.repository.js';
import {
  CustomerOrder,
  CustomerOrderDocument,
  CustomerOrderStatus,
  ItemMatchStatus,
} from './schemas/customer-order.schema.js';
import { CloudStorageService } from '../common/services/cloud-storage.service.js';
import { DocumentProcessorService } from '../common/services/document-processor.service.js';
import { ProductMatcherService } from '../common/services/product-matcher.service.js';

@Injectable()
export class CustomerOrdersService {
  private readonly logger = new Logger(CustomerOrdersService.name);

  constructor(
    private readonly repository: CustomerOrdersRepository,
    private readonly cloudStorage: CloudStorageService,
    private readonly documentProcessor: DocumentProcessorService,
    private readonly productMatcher: ProductMatcherService,
    @InjectModel(CustomerOrder.name) private readonly model: Model<CustomerOrderDocument>,
  ) {}

  async uploadAndProcess(
    file: Express.Multer.File,
    branchId: string,
    userId: string,
  ): Promise<CustomerOrderDocument> {
    const { url, publicId } = await this.cloudStorage.uploadFile(
      file.buffer,
      file.originalname,
    );

    const result = await this.documentProcessor.processFile(file.buffer, file.mimetype);

    const matchResult = await this.productMatcher.matchItems(result.extractedItems, branchId);

    const items = matchResult.matched.map((m) => ({
      extractedName: m.extractedName,
      extractedQuantity: m.extractedQuantity,
      extractedUnitPrice: m.extractedUnitPrice,
      matchedProductId: new Types.ObjectId(m.matchedProductId),
      matchConfidence: m.matchConfidence,
      status: ItemMatchStatus.MATCHED,
    }));

    const unmatchedItems = matchResult.unmatched.map((u) => ({
      name: u.extractedName,
      quantity: u.extractedQuantity,
    }));

    const orderNumber = await this.repository.generateOrderNumber(branchId);

    const order = await this.repository.create({
      orderNumber,
      branchId: new Types.ObjectId(branchId),
      sourceFile: { originalName: file.originalname, mimeType: file.mimetype, url, publicId },
      rawExtractedText: result.rawText,
      items: items as any,
      unmatchedItems,
      status: CustomerOrderStatus.RECEIVED,
      createdBy: new Types.ObjectId(userId),
    });

    this.logger.log(`Customer order ${orderNumber} created with ${items.length} matched, ${unmatchedItems.length} unmatched`);
    return order;
  }

  async findById(id: string): Promise<CustomerOrderDocument> {
    const order = await this.repository.findById(id);
    if (!order) throw new BadRequestException(`Customer order ${id} not found`);
    return order;
  }

  async findAll(filter: CustomerOrderFilter & { branchId?: string }): Promise<CustomerOrderDocument[]> {
    const query: Record<string, any> = {};
    if (filter.branchId) query.branchId = new Types.ObjectId(filter.branchId);
    if (filter.status) query.status = filter.status;
    return this.repository.findAll(query);
  }

  async updateItems(
    id: string,
    items: Array<{ index: number; matchedProductId?: string; status?: string }>,
  ): Promise<CustomerOrderDocument> {
    const order = await this.findById(id);
    if (order.status === CustomerOrderStatus.CANCELLED) {
      throw new BadRequestException('Cannot update a cancelled order');
    }

    for (const update of items) {
      if (update.index >= order.items.length) continue;
      const item = order.items[update.index];
      if (update.matchedProductId) {
        item.matchedProductId = new Types.ObjectId(update.matchedProductId);
        item.status = ItemMatchStatus.MATCHED;
      }
      if (update.status) {
        item.status = update.status as ItemMatchStatus;
      }
    }

    const allResolved = order.items.every((i) => i.status !== ItemMatchStatus.UNMATCHED);
    if (allResolved && order.unmatchedItems.length === 0) {
      order.status = CustomerOrderStatus.REVIEWED;
    }

    return order.save();
  }

  async addNewProduct(
    orderId: string,
    itemIndex: number,
    productData: { name: string; sku?: string; barcode: string; category: string; brand: string; unit: string; reorderLevel: number; basePrice: number; costPrice: number },
    userId: string,
  ): Promise<CustomerOrderDocument> {
    const order = await this.findById(orderId);
    if (itemIndex >= order.items.length) {
      throw new BadRequestException('Invalid item index');
    }

    const item = order.items[itemIndex];
    if (item.status !== ItemMatchStatus.UNMATCHED) {
      throw new BadRequestException('Item is already matched');
    }

    // Create the product in inventory
    const ProductModel = this.model.db.model('Product');
    const product = await ProductModel.create({
      ...productData,
      branchId: order.branchId,
      quantityAvailable: 0,
      isActive: true,
      createdBy: userId,
    });

    item.matchedProductId = product._id;
    item.status = ItemMatchStatus.NEW_PRODUCT_ADDED;

    // Remove from unmatched list
    order.unmatchedItems = order.unmatchedItems.filter((_, i) => i !== itemIndex);

    const allResolved = order.items.every((i) => i.status !== ItemMatchStatus.UNMATCHED);
    if (allResolved && order.unmatchedItems.length === 0) {
      order.status = CustomerOrderStatus.REVIEWED;
    }

    return order.save();
  }
}

export interface CustomerOrderFilter {
  branchId?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}
