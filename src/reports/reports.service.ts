import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PipelineStage, Types } from 'mongoose';
import {
  Sale,
  SaleDocument,
  PaymentMethod,
} from '../sales/schemas/sale.schema.js';
import {
  Transfer,
  TransferDocument,
} from '../transfers/schemas/transfer.schema.js';
import { Product, ProductDocument } from '../products/schemas/product.schema.js';
import {
  SalesReportDto,
  SalesReportResult,
  SalesReportGroupBy,
} from './dto/sales-report.dto.js';
import {
  InventoryReportDto,
  InventoryReportResult,
} from './dto/inventory-report.dto.js';
import {
  ExpiryReportDto,
  ExpiryReportResult,
} from './dto/expiry-report.dto.js';
import {
  TransferReportDto,
  TransferReportResult,
} from './dto/transfer-report.dto.js';
import { CurrencyUtil } from '../common/utils/currency.util.js';
import { PAYMENT_METHOD_LABELS } from '../common/constants/payment-methods.constant.js';

/**
 * ReportsService
 * Generates comprehensive reports using MongoDB aggregation pipelines
 * Requirements: 12.1, 13.1, 13.2, 14.1, 14.2
 * Properties: 49, 51, 54, 56, 57
 */
@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    @InjectModel(Sale.name) private saleModel: Model<SaleDocument>,
    @InjectModel(Product.name) private productModel: Model<ProductDocument>,
    @InjectModel(Transfer.name) private transferModel: Model<TransferDocument>,
  ) {}

  /**
   * Get dashboard statistics for a branch
   * Requirements: 14.1
   */
  async getDashboardStats(branchId: string) {
    this.logger.log(`Getting dashboard stats for branch: ${branchId}`);

    const normalizedBranchId = branchId
      ? Types.ObjectId.isValid(branchId)
        ? new Types.ObjectId(branchId)
        : branchId
      : undefined;

    const saleMatch: Record<string, unknown> = {
      status: 'completed',
    };

    const productMatch: Record<string, unknown> = { isActive: true };

    if (normalizedBranchId) {
      saleMatch.branchId = normalizedBranchId;
      productMatch.branchId = normalizedBranchId;
    }

    const currentDate = new Date();
    const startOfMonth = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      1,
    );
    const startOfDay = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      currentDate.getDate(),
    );

    try {
      // Get total sales for current month
      const monthlySales = await this.saleModel.aggregate([
        {
          $match: {
            ...saleMatch,
            createdAt: { $gte: startOfMonth },
          },
        },
        {
          $group: {
            _id: null,
            totalAmount: { $sum: '$total' },
            count: { $sum: 1 },
          },
        },
      ]);

      // Get today's sales
      const todaysSales = await this.saleModel.aggregate([
        {
          $match: {
            ...saleMatch,
            createdAt: { $gte: startOfDay },
          },
        },
        {
          $group: {
            _id: null,
            totalAmount: { $sum: '$total' },
            count: { $sum: 1 },
          },
        },
      ]);

      const expiringThreshold = new Date(currentDate);
      expiringThreshold.setDate(expiringThreshold.getDate() + 30);

      const [products, activeCustomers] = await Promise.all([
        this.productModel.find(productMatch).lean(),
        this.saleModel.distinct('customerPhone', {
          ...saleMatch,
          customerPhone: { $exists: true, $ne: '' },
        }),
      ]);

      const inStockProducts = products.filter(
        (product) => product.quantityAvailable > 0,
      );
      const lowStockProducts = inStockProducts.filter(
        (product) =>
          product.quantityAvailable <= Math.max(1, product.reorderLevel || 10),
      );
      const expiredProducts = inStockProducts.filter(
        (product) =>
          product.expiryDate && new Date(product.expiryDate) < currentDate,
      );
      const expiringSoonProducts = inStockProducts.filter((product) => {
        if (!product.expiryDate) return false;
        const expiryDate = new Date(product.expiryDate);
        return expiryDate >= currentDate && expiryDate <= expiringThreshold;
      });
      const lowStockItems = lowStockProducts
        .sort((a, b) => a.quantityAvailable - b.quantityAvailable)
        .slice(0, 5)
        .map((product) => ({
          _id: product._id.toString(),
          productName: product.name,
          quantity: product.quantityAvailable,
        }));

      const todaySalesAmount = todaysSales[0]?.totalAmount || 0;
      const todaySalesCount = todaysSales[0]?.count || 0;

      return {
        monthlySales: {
          amount: monthlySales[0]?.totalAmount || 0,
          count: monthlySales[0]?.count || 0,
        },
        todaysSales: {
          amount: todaysSales[0]?.totalAmount || 0,
          count: todaysSales[0]?.count || 0,
        },
        lowStockCount: lowStockProducts.length,
        expiredCount: expiredProducts.length,
        todaySales: todaySalesAmount,
        todaySalesCount,
        totalProducts: inStockProducts.length,
        totalCustomers: activeCustomers.length,
        expiringSoon: expiringSoonProducts.length,
        lowStockProducts: lowStockProducts.length,
        lowStockItems,
      };
    } catch (error) {
      this.logger.error('Error getting dashboard stats:', error);
      throw error;
    }
  }

  /**
   * Generate sales report with filtering
   * Requirements: 14.1
   * Property 56: Sales report filtering
   */
  async generateSalesReport(dto: SalesReportDto): Promise<SalesReportResult> {
    this.logger.log('Generating sales report');

    // Build match stage
    const matchStage: Record<string, unknown> = {};
    if (dto.branchId) {
      matchStage.branchId = dto.branchId;
    }
    if (dto.cashierId) {
      matchStage.cashierId = dto.cashierId;
    }
    if (dto.startDate || dto.endDate) {
      matchStage.createdAt = {};
      if (dto.startDate) {
        (matchStage.createdAt as Record<string, unknown>).$gte = new Date(dto.startDate);
      }
      if (dto.endDate) {
        (matchStage.createdAt as Record<string, unknown>).$lte = new Date(dto.endDate);
      }
    }

    // Filter by product if specified
    if (dto.productId) {
      matchStage['items.productId'] = dto.productId;
    }

    // Calculate summary statistics
    const summaryPipeline = [
      { $match: matchStage },
      {
        $group: {
          _id: null,
          totalSales: { $sum: 1 },
          totalAmount: { $sum: '$total' },
          totalDiscount: { $sum: '$discount' },
          totalReturns: { $sum: '$returnedAmount' },
        },
      },
      {
        $project: {
          _id: 0,
          totalSales: 1,
          totalAmount: 1,
          totalDiscount: 1,
          totalReturns: 1,
          netAmount: { $subtract: ['$totalAmount', '$totalReturns'] },
          averageTransaction: {
            $cond: [
              { $gt: ['$totalSales', 0] },
              { $divide: ['$totalAmount', '$totalSales'] },
              0,
            ],
          },
          transactionCount: '$totalSales',
        },
      },
    ];

    const summaryResult = await this.saleModel.aggregate(summaryPipeline);
    const summary = summaryResult[0] || {
      totalSales: 0,
      totalAmount: 0,
      totalDiscount: 0,
      totalReturns: 0,
      netAmount: 0,
      averageTransaction: 0,
      transactionCount: 0,
    };

    // Format currency values in summary
    const formattedSummary = {
      ...summary,
      totalAmountFormatted: CurrencyUtil.format(summary.totalAmount),
      totalDiscountFormatted: CurrencyUtil.format(summary.totalDiscount),
      totalReturnsFormatted: CurrencyUtil.format(summary.totalReturns),
      netAmountFormatted: CurrencyUtil.format(summary.netAmount),
      averageTransactionFormatted: CurrencyUtil.format(
        summary.averageTransaction,
      ),
    };

    // Generate payment method breakdown
    const paymentMethodBreakdown =
      await this.generatePaymentMethodBreakdown(matchStage);

    // Generate breakdown if groupBy is specified
    let breakdown: Array<{
      _id: string;
      name?: string;
      totalSales: number;
      totalAmount: number;
      totalAmountFormatted?: string;
      transactionCount: number;
    }> | undefined;
    if (dto.groupBy) {
      breakdown = await this.generateSalesBreakdown(matchStage, dto.groupBy);
    }

    // Get top products
    const topProducts = await this.getTopProducts(matchStage);

    return {
      summary: formattedSummary,
      paymentMethodBreakdown,
      breakdown,
      topProducts,
    };
  }

  /**
   * Generate payment method breakdown
   * Requirements: 4.5
   * Property 12: Payment method breakdown completeness
   */
  private async generatePaymentMethodBreakdown(
    matchStage: Record<string, unknown>,
  ): Promise<Array<{
    paymentMethod: string;
    label: string;
    count: number;
    totalAmount: number;
    totalAmountFormatted?: string;
  }>> {
    // Get all payment methods from the enum
    const allPaymentMethods = Object.values(PaymentMethod);

    // Aggregate sales by payment method
    const pipeline = [
      { $match: matchStage },
      {
        $group: {
          _id: '$paymentMethod',
          count: { $sum: 1 },
          totalAmount: { $sum: '$total' },
        },
      },
    ];

    const results = await this.saleModel.aggregate(pipeline);

    // Create a map of results for easy lookup
    const resultsMap = new Map(
      results.map((r) => [
        r._id,
        { count: r.count, totalAmount: r.totalAmount },
      ]),
    );

    // Ensure all payment methods are represented
    return allPaymentMethods.map((method) => {
      const data = resultsMap.get(method) || { count: 0, totalAmount: 0 };
      return {
        paymentMethod: method,
        label: PAYMENT_METHOD_LABELS[method] || method,
        count: data.count,
        totalAmount: data.totalAmount,
        totalAmountFormatted: CurrencyUtil.format(data.totalAmount),
      };
    });
  }

  /**
   * Generate sales breakdown by specified dimension
   */
  private async generateSalesBreakdown(
    matchStage: Record<string, unknown>,
    groupBy: SalesReportGroupBy,
  ): Promise<Array<{
    _id: string;
    name?: string;
    totalSales: number;
    totalAmount: number;
    totalAmountFormatted?: string;
    transactionCount: number;
  }>> {
    let groupField: string;
    switch (groupBy) {
      case SalesReportGroupBy.BRANCH:
        groupField = '$branchId';
        break;
      case SalesReportGroupBy.CASHIER:
        groupField = '$cashierId';
        break;
      case SalesReportGroupBy.DAY:
        groupField = {
          $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
        } as any;
        break;
      case SalesReportGroupBy.PRODUCT:
        groupField = '$items.productId';
        break;
      default:
        groupField = '$branchId';
    }

    const pipeline: unknown[] = [{ $match: matchStage }];

    // For product grouping, unwind items first
    if (groupBy === SalesReportGroupBy.PRODUCT) {
      pipeline.push({ $unwind: '$items' });
    }

    pipeline.push(
      {
        $group: {
          _id: groupField,
          totalSales: { $sum: 1 },
          totalAmount: {
            $sum:
              groupBy === SalesReportGroupBy.PRODUCT
                ? '$items.subtotal'
                : '$total',
          },
          transactionCount: { $sum: 1 },
        },
      },
      { $sort: { totalAmount: -1 } },
      { $limit: 20 },
    );

    return this.saleModel.aggregate(pipeline as PipelineStage[]);
  }

  /**
   * Get top selling products
   */
  private async getTopProducts(matchStage: Record<string, unknown>): Promise<Array<{
    productId: string;
    productName?: string;
    quantitySold: number;
    totalAmount: number;
    totalAmountFormatted?: string;
  }>> {
    const pipeline: unknown[] = [
      { $match: matchStage },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.productId',
          quantitySold: { $sum: '$items.quantity' },
          totalAmount: { $sum: '$items.subtotal' },
        },
      },
      { $sort: { quantitySold: -1 } },
      { $limit: 10 },
      {
        $project: {
          _id: 0,
          productId: '$_id',
          quantitySold: 1,
          totalAmount: 1,
        },
      },
    ];

    return this.saleModel.aggregate(pipeline as PipelineStage[]);
  }

  /**
   * Generate inventory report with valuation
   * Requirements: 13.1, 13.2, 14.2
   * Property 57: Inventory report completeness
   * Property 54: Valuation report structure
   */
  async generateInventoryReport(
    dto: InventoryReportDto,
  ): Promise<InventoryReportResult> {
    this.logger.log('Generating inventory report');
    const matchStage: Record<string, unknown> = { isActive: true };
    if (dto.branchId) {
      matchStage.branchId = new Types.ObjectId(dto.branchId);
    }

    const now = new Date();
    const products = await this.productModel
      .find(matchStage)
      .populate('branchId')
      .lean();

    const items = products
      .filter((product: any) => {
        if (product.quantityAvailable <= 0) return false;
        if (!dto.includeExpired && product.expiryDate && new Date(product.expiryDate) < now) {
          return false;
        }
        return true;
      })
      .map((product: any) => {
        const totalValue = product.quantityAvailable * product.costPrice;
        const isLowStock =
          product.quantityAvailable <= Math.max(1, product.reorderLevel || 10);

        return {
          productId: product._id.toString(),
          productName: product.name,
          branchId: product.branchId?._id?.toString?.() || product.branchId?.toString?.() || '',
          branchName: product.branchId?.name,
          totalQuantity: product.quantityAvailable,
          batchCount: 1,
          totalValue,
          totalValueFormatted: CurrencyUtil.format(totalValue),
          averageCost: product.costPrice,
          averageCostFormatted: CurrencyUtil.format(product.costPrice),
          isLowStock,
          reorderLevel: product.reorderLevel,
          batches: [
            {
              batchId: product._id.toString(),
              lotNumber: 'N/A',
              quantity: product.quantityAvailable,
              expiryDate: product.expiryDate,
              purchasePrice: product.costPrice,
              purchasePriceFormatted: CurrencyUtil.format(product.costPrice),
              sellingPrice: product.suggestedRetailPrice || product.basePrice,
              sellingPriceFormatted: CurrencyUtil.format(
                product.suggestedRetailPrice || product.basePrice,
              ),
              value: totalValue,
              valueFormatted: CurrencyUtil.format(totalValue),
              isExpired:
                !!product.expiryDate && new Date(product.expiryDate) < now,
            },
          ],
        };
      });

    const filteredItems = dto.lowStockOnly
      ? items.filter((item) => item.isLowStock)
      : items;

    const totalValue = filteredItems.reduce((sum, item) => sum + item.totalValue, 0);
    return {
      summary: {
        totalProducts: filteredItems.length,
        totalBatches: filteredItems.length,
        totalQuantity: filteredItems.reduce(
          (sum, item) => sum + item.totalQuantity,
          0,
        ),
        totalValue,
        totalValueFormatted: CurrencyUtil.format(totalValue),
        lowStockItems: filteredItems.filter((item) => item.isLowStock).length,
        expiredItems: filteredItems.filter(
          (item) => item.batches[0]?.isExpired,
        ).length,
      },
      items: filteredItems,
    };
  }

  /**
   * Generate expiry report
   * Requirements: 12.1, 12.3, 12.4
   * Property 49: Expiry report filtering
   * Property 51: Expiry loss calculation
   */
  async generateExpiryReport(
    dto: ExpiryReportDto,
  ): Promise<ExpiryReportResult> {
    this.logger.log('Generating expiry report');

    const now = new Date();
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + (dto.daysUntilExpiry || 90));

    const matchStage: Record<string, unknown> = {
      isActive: true,
      quantityAvailable: { $gt: 0 },
      expiryDate: { $exists: true, $ne: null, $lte: futureDate },
    };
    if (dto.branchId) {
      matchStage.branchId = new Types.ObjectId(dto.branchId);
    }

    const products = await this.productModel
      .find(matchStage)
      .populate('branchId')
      .sort({ expiryDate: 1 })
      .lean();

    const expiringBatches = products.map((product: any) => {
      const expiryDate = new Date(product.expiryDate);
      const daysUntilExpiry = Math.ceil(
        (expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
      );
      const sellingPrice = product.suggestedRetailPrice || product.basePrice;
      const potentialLoss = product.quantityAvailable * product.costPrice;

      return {
        batchId: product._id.toString(),
        productId: product._id.toString(),
        productName: product.name,
        branchId: product.branchId?._id?.toString?.() || product.branchId?.toString?.() || '',
        branchName: product.branchId?.name,
        lotNumber: 'N/A',
        quantity: product.quantityAvailable,
        expiryDate,
        daysUntilExpiry,
        purchasePrice: product.costPrice,
        purchasePriceFormatted: CurrencyUtil.format(product.costPrice),
        sellingPrice,
        sellingPriceFormatted: CurrencyUtil.format(sellingPrice),
        potentialLoss,
        potentialLossFormatted: CurrencyUtil.format(potentialLoss),
        isExpired: daysUntilExpiry < 0,
      };
    });

    // Calculate summary and timeframe breakdown
    const potentialLoss = expiringBatches.reduce(
      (sum, b) => sum + b.potentialLoss,
      0,
    );
    const expiredValue = expiringBatches
      .filter((b) => b.isExpired)
      .reduce((sum, b) => sum + b.potentialLoss, 0);

    const summary = {
      totalBatches: expiringBatches.length,
      totalQuantity: expiringBatches.reduce((sum, b) => sum + b.quantity, 0),
      potentialLoss,
      potentialLossFormatted: CurrencyUtil.format(potentialLoss),
      expiredBatches: expiringBatches.filter((b) => b.isExpired).length,
      expiredQuantity: expiringBatches
        .filter((b) => b.isExpired)
        .reduce((sum, b) => sum + b.quantity, 0),
      expiredValue,
      expiredValueFormatted: CurrencyUtil.format(expiredValue),
    };

    const byTimeframe = {
      expired: this.calculateTimeframeStats(
        expiringBatches.filter((b) => b.daysUntilExpiry < 0),
      ),
      within30Days: this.calculateTimeframeStats(
        expiringBatches.filter(
          (b) => b.daysUntilExpiry >= 0 && b.daysUntilExpiry <= 30,
        ),
      ),
      within60Days: this.calculateTimeframeStats(
        expiringBatches.filter(
          (b) => b.daysUntilExpiry > 30 && b.daysUntilExpiry <= 60,
        ),
      ),
      within90Days: this.calculateTimeframeStats(
        expiringBatches.filter(
          (b) => b.daysUntilExpiry > 60 && b.daysUntilExpiry <= 90,
        ),
      ),
    };

    return {
      summary,
      expiringBatches,
      byTimeframe,
    };
  }

  /**
   * Calculate statistics for a timeframe
   */
  private calculateTimeframeStats(batches: Array<{ potentialLoss: number; quantity: number }>): {
    count: number;
    quantity: number;
    value: number;
    valueFormatted: string;
  } {
    const value = batches.reduce((sum, b) => sum + b.potentialLoss, 0);
    return {
      count: batches.length,
      quantity: batches.reduce((sum, b) => sum + b.quantity, 0),
      value,
      valueFormatted: CurrencyUtil.format(value),
    };
  }

  /**
   * Generate transfer report
   * Requirements: 14.3
   * Property 58: Transfer log structure
   */
  async generateTransferReport(
    dto: TransferReportDto,
  ): Promise<TransferReportResult> {
    this.logger.log('Generating transfer report');

    // Build match stage
    const matchStage: Record<string, unknown> = {};
    if (dto.branchId) {
      matchStage.$or = [
        { sourceBranchId: dto.branchId },
        { destinationBranchId: dto.branchId },
      ];
    }
    if (dto.sourceBranchId) {
      matchStage.sourceBranchId = dto.sourceBranchId;
    }
    if (dto.destinationBranchId) {
      matchStage.destinationBranchId = dto.destinationBranchId;
    }
    if (dto.status) {
      matchStage.status = dto.status;
    }
    if (dto.startDate || dto.endDate) {
      matchStage.createdAt = {};
      if (dto.startDate) {
        (matchStage.createdAt as Record<string, unknown>).$gte = new Date(dto.startDate);
      }
      if (dto.endDate) {
        (matchStage.createdAt as Record<string, unknown>).$lte = new Date(dto.endDate);
      }
    }

    // Get transfers with populated references
    const transfers = await this.transferModel
      .find(matchStage)
      .populate('sourceBranchId')
      .populate('destinationBranchId')
      .populate('productId')
      .populate('requestedBy')
      .populate('approvedBy')
      .sort({ createdAt: -1 })
      .lean();

    // Calculate summary
    const summary = {
      totalTransfers: transfers.length,
      pendingTransfers: transfers.filter((t) => t.status === 'pending').length,
      approvedTransfers: transfers.filter((t) => t.status === 'approved')
        .length,
      rejectedTransfers: transfers.filter((t) => t.status === 'rejected')
        .length,
      completedTransfers: transfers.filter((t) => t.status === 'completed')
        .length,
    };

    // Format transfers
    const formattedTransfers = transfers.map((transfer: any) => ({
      transferId: transfer._id.toString(),
      sourceBranchId: transfer.sourceBranchId._id.toString(),
      sourceBranchName: transfer.sourceBranchId.name,
      destinationBranchId: transfer.destinationBranchId._id.toString(),
      destinationBranchName: transfer.destinationBranchId.name,
      productId: transfer.productId._id.toString(),
      productName: transfer.productId.name,
      quantity: transfer.quantity,
      status: transfer.status,
      requestedBy: transfer.requestedBy._id.toString(),
      requestedByName: `${transfer.requestedBy.firstName} ${transfer.requestedBy.lastName}`,
      approvedBy: transfer.approvedBy?._id.toString(),
      approvedByName: transfer.approvedBy
        ? `${transfer.approvedBy.firstName} ${transfer.approvedBy.lastName}`
        : undefined,
      createdAt: transfer.createdAt!,
      approvedAt: transfer.updatedAt,
      completedAt: transfer.completedAt,
      reason: transfer.reason,
    }));

    return {
      summary,
      transfers: formattedTransfers,
    };
  }
}
