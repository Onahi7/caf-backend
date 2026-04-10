import { IsOptional, IsString, IsBoolean, IsEnum } from 'class-validator';

export enum ValuationMethod {
  FIFO = 'fifo',
  MOVING_AVERAGE = 'moving_average',
}

/**
 * Inventory report filter DTO
 * Requirements: 13.1, 13.2, 14.2
 * Property 57: Inventory report completeness
 */
export class InventoryReportDto {
  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsBoolean()
  includeExpired?: boolean;

  @IsOptional()
  @IsBoolean()
  lowStockOnly?: boolean;

  @IsOptional()
  @IsEnum(ValuationMethod)
  valuationMethod?: ValuationMethod;
}

/**
 * Inventory report result interface
 * Requirements: 4.3
 * Property 11: Report currency formatting
 */
export interface InventoryReportResult {
  summary: {
    totalProducts: number;
    totalBatches: number;
    totalQuantity: number;
    totalValue: number;
    totalValueFormatted?: string;
    lowStockItems: number;
    expiredItems: number;
  };
  items: Array<{
    productId: string;
    productName?: string;
    branchId: string;
    branchName?: string;
    totalQuantity: number;
    batchCount: number;
    totalValue: number;
    totalValueFormatted?: string;
    averageCost: number;
    averageCostFormatted?: string;
    isLowStock: boolean;
    batches: Array<{
      batchId: string;
      lotNumber: string;
      quantity: number;
      expiryDate: Date;
      purchasePrice: number;
      purchasePriceFormatted?: string;
      sellingPrice: number;
      sellingPriceFormatted?: string;
      value: number;
      valueFormatted?: string;
      isExpired: boolean;
    }>;
  }>;
}
