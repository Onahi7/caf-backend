import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import Fuse from 'fuse.js';
import { Product, ProductDocument } from '../../products/schemas/product.schema.js';

export interface MatchedItem {
  extractedName: string;
  extractedQuantity: number;
  extractedUnitPrice?: number;
  matchedProductId: string;
  matchedProductName: string;
  matchedProductSku: string;
  matchConfidence: number;
}

export interface UnmatchedItem {
  extractedName: string;
  extractedQuantity: number;
  extractedUnitPrice?: number;
}

export interface MatchResult {
  matched: MatchedItem[];
  unmatched: UnmatchedItem[];
}

@Injectable()
export class ProductMatcherService {
  constructor(
    @InjectModel(Product.name) private readonly productModel: Model<ProductDocument>,
  ) {}

  async matchItems(
    items: Array<{ name: string; quantity: number; unitPrice?: number }>,
    branchId: string,
  ): Promise<MatchResult> {
    const products = await this.productModel
      .find({ branchId, isActive: true })
      .lean()
      .exec();

    if (products.length === 0) {
      return {
        matched: [],
        unmatched: items.map((i) => ({
          extractedName: i.name,
          extractedQuantity: i.quantity,
          extractedUnitPrice: i.unitPrice,
        })),
      };
    }

    const fuse = new Fuse(products, {
      keys: [
        { name: 'name', weight: 0.6 },
        { name: 'sku', weight: 0.3 },
        { name: 'barcode', weight: 0.1 },
      ],
      threshold: 0.4,
      ignoreLocation: true,
    });

    const matched: MatchedItem[] = [];
    const unmatched: UnmatchedItem[] = [];

    for (const item of items) {
      const results = fuse.search(item.name);
      if (results.length > 0 && results[0].score! < 0.4) {
        const p = results[0].item as any;
        matched.push({
          extractedName: item.name,
          extractedQuantity: item.quantity,
          extractedUnitPrice: item.unitPrice,
          matchedProductId: p._id.toString(),
          matchedProductName: p.name,
          matchedProductSku: p.sku,
          matchConfidence: 1 - (results[0].score ?? 0),
        });
      } else {
        unmatched.push({
          extractedName: item.name,
          extractedQuantity: item.quantity,
          extractedUnitPrice: item.unitPrice,
        });
      }
    }

    return { matched, unmatched };
  }
}
