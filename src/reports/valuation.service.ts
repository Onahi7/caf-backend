import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Batch, BatchDocument } from '../batches/schemas/batch.schema.js';
import {
  StockMovement,
  StockMovementDocument,
  MovementType,
} from '../inventory/schemas/stock-movement.schema.js';
import { ValuationMethod } from './dto/inventory-report.dto.js';
import { CurrencyUtil } from '../common/utils/currency.util.js';

/**
 * Valuation result interface
 * Requirements: 4.3
 * Property 11: Report currency formatting
 */
export interface ValuationResult {
  productId: string;
  branchId: string;
  quantity: number;
  totalValue: number;
  totalValueFormatted: string;
  averageCost: number;
  averageCostFormatted: string;
  method: ValuationMethod;
}

/**
 * COGS (Cost of Goods Sold) result interface
 */
export interface COGSResult {
  saleId: string;
  totalCOGS: number;
  items: Array<{
    productId: string;
    batchId: string;
    quantity: number;
    unitCost: number;
    totalCost: number;
  }>;
}

/**
 * ValuationService
 * Handles inventory valuation using FIFO and moving average methods
 * Requirements: 13.1, 13.4
 * Properties: 53, 55
 */
@Injectable()
export class ValuationService {
  private readonly logger = new Logger(ValuationService.name);

  constructor(
    @InjectModel(Batch.name) private batchModel: Model<BatchDocument>,
    @InjectModel(StockMovement.name)
    private stockMovementModel: Model<StockMovementDocument>,
  ) {}

  /**
   * Calculate inventory valuation for a product at a branch
   * Property 53: Valuation method support
   * Requirements: 13.1
   */
  async calculateValuation(
    productId: string,
    branchId: string,
    method: ValuationMethod = ValuationMethod.FIFO,
  ): Promise<ValuationResult> {
    this.logger.log(
      `Calculating ${method} valuation for product ${productId} at branch ${branchId}`,
    );

    if (method === ValuationMethod.FIFO) {
      return this.calculateFIFOValuation(productId, branchId);
    } else {
      return this.calculateMovingAverageValuation(productId, branchId);
    }
  }

  /**
   * Calculate FIFO (First In First Out) valuation
   * Property 53: Valuation method support
   */
  private async calculateFIFOValuation(
    productId: string,
    branchId: string,
  ): Promise<ValuationResult> {
    // Get all batches for the product at the branch, ordered by creation date (FIFO)
    const batches = await this.batchModel
      .find({
        productId,
        branchId,
        isDepleted: false,
        quantityAvailable: { $gt: 0 },
      })
      .sort({ createdAt: 1 }) // Oldest first for FIFO
      .lean();

    let totalQuantity = 0;
    let totalValue = 0;

    for (const batch of batches) {
      totalQuantity += batch.quantityAvailable;
      totalValue += batch.quantityAvailable * batch.purchasePrice;
    }

    const averageCost = totalQuantity > 0 ? totalValue / totalQuantity : 0;

    return {
      productId,
      branchId,
      quantity: totalQuantity,
      totalValue,
      totalValueFormatted: CurrencyUtil.format(totalValue),
      averageCost,
      averageCostFormatted: CurrencyUtil.format(averageCost),
      method: ValuationMethod.FIFO,
    };
  }

  /**
   * Calculate moving average valuation
   * Property 53: Valuation method support
   */
  private async calculateMovingAverageValuation(
    productId: string,
    branchId: string,
  ): Promise<ValuationResult> {
    // Get all purchase movements for the product at the branch
    const purchaseMovements = await this.stockMovementModel
      .find({
        productId,
        branchId,
        movementType: MovementType.PURCHASE,
      })
      .sort({ timestamp: 1 })
      .lean();

    // Calculate moving average
    let totalQuantity = 0;
    let totalValue = 0;
    let runningAverage = 0;

    for (const movement of purchaseMovements) {
      // Get the batch to find purchase price
      const batch = await this.batchModel.findById(movement.batchId).lean();
      if (!batch) continue;

      const purchaseQuantity = movement.quantity;
      const purchasePrice = batch.purchasePrice;
      const purchaseValue = purchaseQuantity * purchasePrice;

      // Update moving average
      if (totalQuantity === 0) {
        runningAverage = purchasePrice;
      } else {
        runningAverage =
          (totalValue + purchaseValue) / (totalQuantity + purchaseQuantity);
      }

      totalQuantity += purchaseQuantity;
      totalValue += purchaseValue;
    }

    // Get current stock quantity
    const currentBatches = await this.batchModel
      .find({
        productId,
        branchId,
        isDepleted: false,
        quantityAvailable: { $gt: 0 },
      })
      .lean();

    const currentQuantity = currentBatches.reduce(
      (sum, batch) => sum + batch.quantityAvailable,
      0,
    );

    // Current value using moving average
    const currentValue = currentQuantity * runningAverage;

    return {
      productId,
      branchId,
      quantity: currentQuantity,
      totalValue: currentValue,
      totalValueFormatted: CurrencyUtil.format(currentValue),
      averageCost: runningAverage,
      averageCostFormatted: CurrencyUtil.format(runningAverage),
      method: ValuationMethod.MOVING_AVERAGE,
    };
  }

  /**
   * Calculate COGS for a sale
   * Property 55: COGS tracking
   * Requirements: 13.4
   */
  async calculateCOGS(
    saleId: string,
    items: Array<{
      productId: string;
      batchId: string;
      quantity: number;
    }>,
  ): Promise<COGSResult> {
    this.logger.log(`Calculating COGS for sale ${saleId}`);

    let totalCOGS = 0;
    const cogsItems: COGSResult['items'] = [];

    for (const item of items) {
      // Get the batch to find purchase price
      const batch = await this.batchModel.findById(item.batchId).lean();
      if (!batch) {
        this.logger.warn(
          `Batch ${item.batchId} not found for COGS calculation`,
        );
        continue;
      }

      const unitCost = batch.purchasePrice;
      const totalCost = item.quantity * unitCost;

      totalCOGS += totalCost;
      cogsItems.push({
        productId: item.productId,
        batchId: item.batchId,
        quantity: item.quantity,
        unitCost,
        totalCost,
      });
    }

    return {
      saleId,
      totalCOGS,
      items: cogsItems,
    };
  }

  /**
   * Calculate valuation for all products at a branch
   */
  async calculateBranchValuation(
    branchId: string,
    method: ValuationMethod = ValuationMethod.FIFO,
  ): Promise<ValuationResult[]> {
    this.logger.log(`Calculating ${method} valuation for branch ${branchId}`);

    // Get all unique products at the branch
    const batches = await this.batchModel
      .find({
        branchId,
        isDepleted: false,
        quantityAvailable: { $gt: 0 },
      })
      .distinct('productId');

    const valuations: ValuationResult[] = [];

    for (const productId of batches) {
      const valuation = await this.calculateValuation(
        productId.toString(),
        branchId,
        method,
      );
      valuations.push(valuation);
    }

    return valuations;
  }

  /**
   * Calculate total inventory value for a branch
   */
  async calculateTotalBranchValue(
    branchId: string,
    method: ValuationMethod = ValuationMethod.FIFO,
  ): Promise<number> {
    const valuations = await this.calculateBranchValuation(branchId, method);
    return valuations.reduce((sum, v) => sum + v.totalValue, 0);
  }

  /**
   * Calculate company-wide inventory value
   */
  async calculateCompanyWideValue(
    method: ValuationMethod = ValuationMethod.FIFO,
  ): Promise<{
    totalValue: number;
    byBranch: Array<{ branchId: string; value: number }>;
  }> {
    this.logger.log(`Calculating company-wide ${method} valuation`);

    // Get all unique branches
    const branches = await this.batchModel
      .find({
        isDepleted: false,
        quantityAvailable: { $gt: 0 },
      })
      .distinct('branchId');

    const byBranch: Array<{ branchId: string; value: number }> = [];
    let totalValue = 0;

    for (const branchId of branches) {
      const branchValue = await this.calculateTotalBranchValue(
        branchId.toString(),
        method,
      );
      byBranch.push({
        branchId: branchId.toString(),
        value: branchValue,
      });
      totalValue += branchValue;
    }

    return {
      totalValue,
      byBranch,
    };
  }
}
