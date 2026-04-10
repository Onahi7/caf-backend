import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  Product,
  ProductDocument,
} from '../products/schemas/product.schema.js';
import { Batch, BatchDocument } from '../batches/schemas/batch.schema.js';

export interface PricingStrategy {
  useProductBasePrice: boolean;
  useLatestBatchPrice: boolean;
  useCostPlusMarkup: boolean;
  markupPercentage?: number;
}

export interface ProductPricing {
  productId: string;
  productName: string;
  basePrice: number;
  costPrice: number;
  suggestedRetailPrice: number;
  markupPercentage: number;
  effectiveSellingPrice: number;
  batchPrices: {
    batchId: string;
    lotNumber: string;
    sellingPrice: number;
    purchasePrice: number;
    expiryDate: Date;
  }[];
}

export interface BulkPriceUpdateRequest {
  strategy: PricingStrategy;
  applyToProducts?: string[];
  applyToBranches?: string[];
  newBasePrice?: number;
  newMarkupPercentage?: number;
}

@Injectable()
export class PricingService {
  constructor(
    @InjectModel(Product.name) private productModel: Model<ProductDocument>,
    @InjectModel(Batch.name) private batchModel: Model<BatchDocument>,
  ) {}

  /**
   * Get comprehensive pricing information for a product
   */
  async getProductPricing(
    productId: string,
    branchId?: string,
  ): Promise<ProductPricing> {
    const product = await this.productModel.findById(productId);
    if (!product) {
      throw new Error('Product not found');
    }

    const batchQuery = branchId
      ? { productId, branchId, quantityAvailable: { $gt: 0 } }
      : { productId, quantityAvailable: { $gt: 0 } };

    const batches = await this.batchModel
      .find(batchQuery)
      .sort({ expiryDate: 1 })
      .exec();

    const batchPrices = batches.map((batch) => ({
      batchId: batch._id.toString(),
      lotNumber: batch.lotNumber,
      sellingPrice: batch.sellingPrice,
      purchasePrice: batch.purchasePrice,
      expiryDate: batch.expiryDate,
    }));

    // Calculate effective selling price based on strategy
    let effectiveSellingPrice = product.basePrice;

    if (product.markupPercentage > 0) {
      effectiveSellingPrice =
        product.costPrice * (1 + product.markupPercentage / 100);
    }

    if (product.suggestedRetailPrice > 0) {
      effectiveSellingPrice = product.suggestedRetailPrice;
    }

    return {
      productId: product._id.toString(),
      productName: product.name,
      basePrice: product.basePrice,
      costPrice: product.costPrice,
      suggestedRetailPrice: product.suggestedRetailPrice,
      markupPercentage: product.markupPercentage,
      effectiveSellingPrice,
      batchPrices,
    };
  }

  /**
   * Update product-level pricing
   */
  async updateProductPricing(
    productId: string,
    pricing: {
      basePrice?: number;
      costPrice?: number;
      suggestedRetailPrice?: number;
      markupPercentage?: number;
    },
  ): Promise<ProductDocument | null> {
    return this.productModel
      .findByIdAndUpdate(productId, { $set: pricing }, { new: true })
      .exec();
  }

  /**
   * Bulk update pricing based on strategy
   */
  async bulkUpdatePricing(request: BulkPriceUpdateRequest): Promise<{
    updatedProducts: number;
    updatedBatches: number;
  }> {
    let updatedProducts = 0;
    let updatedBatches = 0;

    // Update product-level pricing
    if (request.strategy.useProductBasePrice && request.newBasePrice) {
      const productQuery = request.applyToProducts?.length
        ? { _id: { $in: request.applyToProducts } }
        : {};

      const result = await this.productModel.updateMany(productQuery, {
        $set: { basePrice: request.newBasePrice },
      });
      updatedProducts += result.modifiedCount;
    }

    if (request.strategy.useCostPlusMarkup && request.newMarkupPercentage) {
      const productQuery = request.applyToProducts?.length
        ? { _id: { $in: request.applyToProducts } }
        : {};

      const result = await this.productModel.updateMany(productQuery, {
        $set: { markupPercentage: request.newMarkupPercentage },
      });
      updatedProducts += result.modifiedCount;

      // Update batch selling prices based on new markup
      if (request.strategy.useCostPlusMarkup) {
        const products = await this.productModel.find(productQuery);

        for (const product of products) {
          const newSellingPrice =
            product.costPrice * (1 + request.newMarkupPercentage / 100);

          const batchQuery = {
            productId: product._id,
            ...(request.applyToBranches?.length && {
              branchId: { $in: request.applyToBranches },
            }),
          };

          const batchResult = await this.batchModel.updateMany(batchQuery, {
            $set: { sellingPrice: newSellingPrice },
          });
          updatedBatches += batchResult.modifiedCount;
        }
      }
    }

    return { updatedProducts, updatedBatches };
  }

  /**
   * Synchronize batch prices with product pricing strategy
   */
  async synchronizeBatchPrices(
    productId: string,
    branchId?: string,
  ): Promise<number> {
    const product = await this.productModel.findById(productId);
    if (!product) {
      throw new Error('Product not found');
    }

    let newSellingPrice = product.basePrice;

    // Apply markup if configured
    if (product.markupPercentage > 0) {
      newSellingPrice =
        product.costPrice * (1 + product.markupPercentage / 100);
    }

    // Use suggested retail price if available
    if (product.suggestedRetailPrice > 0) {
      newSellingPrice = product.suggestedRetailPrice;
    }

    const batchQuery = branchId ? { productId, branchId } : { productId };

    const result = await this.batchModel.updateMany(batchQuery, {
      $set: { sellingPrice: newSellingPrice },
    });

    return result.modifiedCount;
  }

  /**
   * Get pricing analytics for a branch or company-wide
   */
  async getPricingAnalytics(branchId?: string): Promise<{
    averageMarkup: number;
    totalProducts: number;
    productsWithCustomPricing: number;
    averageSellingPrice: number;
    priceRanges: { range: string; count: number }[];
  }> {
    const matchStage = branchId ? { branchId } : {};

    const pipeline = [
      { $match: matchStage },
      {
        $lookup: {
          from: 'products',
          localField: 'productId',
          foreignField: '_id',
          as: 'product',
        },
      },
      { $unwind: '$product' },
      {
        $group: {
          _id: '$productId',
          avgSellingPrice: { $avg: '$sellingPrice' },
          avgPurchasePrice: { $avg: '$purchasePrice' },
          basePrice: { $first: '$product.basePrice' },
          markupPercentage: { $first: '$product.markupPercentage' },
        },
      },
    ];

    const results = await this.batchModel.aggregate(pipeline);

    const totalProducts = results.length;
    const productsWithCustomPricing = results.filter(
      (r) => r.markupPercentage > 0,
    ).length;
    const averageMarkup =
      results.reduce((sum, r) => sum + (r.markupPercentage || 0), 0) /
      totalProducts;
    const averageSellingPrice =
      results.reduce((sum, r) => sum + r.avgSellingPrice, 0) / totalProducts;

    const priceRanges = [
      {
        range: '0-100',
        count: results.filter((r) => r.avgSellingPrice < 100).length,
      },
      {
        range: '100-500',
        count: results.filter(
          (r) => r.avgSellingPrice >= 100 && r.avgSellingPrice < 500,
        ).length,
      },
      {
        range: '500-1000',
        count: results.filter(
          (r) => r.avgSellingPrice >= 500 && r.avgSellingPrice < 1000,
        ).length,
      },
      {
        range: '1000+',
        count: results.filter((r) => r.avgSellingPrice >= 1000).length,
      },
    ];

    return {
      averageMarkup,
      totalProducts,
      productsWithCustomPricing,
      averageSellingPrice,
      priceRanges,
    };
  }
}
