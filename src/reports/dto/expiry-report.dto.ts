import { IsOptional, IsString, IsNumber, Min } from 'class-validator';

/**
 * Expiry report filter DTO
 * Requirements: 12.1, 12.3, 12.4
 * Property 49: Expiry report filtering
 * Property 51: Expiry loss calculation
 */
export class ExpiryReportDto {
  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  daysUntilExpiry?: number = 90; // Default to 90 days
}

/**
 * Expiry report result interface
 * Requirements: 4.1
 * Property 11: Report currency formatting
 */
export interface ExpiryReportResult {
  summary: {
    totalBatches: number;
    totalQuantity: number;
    potentialLoss: number;
    potentialLossFormatted?: string;
    expiredBatches: number;
    expiredQuantity: number;
    expiredValue: number;
    expiredValueFormatted?: string;
  };
  expiringBatches: Array<{
    batchId: string;
    productId: string;
    productName?: string;
    branchId: string;
    branchName?: string;
    lotNumber: string;
    quantity: number;
    expiryDate: Date;
    daysUntilExpiry: number;
    purchasePrice: number;
    purchasePriceFormatted?: string;
    sellingPrice: number;
    sellingPriceFormatted?: string;
    potentialLoss: number;
    potentialLossFormatted?: string;
    isExpired: boolean;
  }>;
  byTimeframe: {
    expired: {
      count: number;
      quantity: number;
      value: number;
      valueFormatted?: string;
    };
    within30Days: {
      count: number;
      quantity: number;
      value: number;
      valueFormatted?: string;
    };
    within60Days: {
      count: number;
      quantity: number;
      value: number;
      valueFormatted?: string;
    };
    within90Days: {
      count: number;
      quantity: number;
      value: number;
      valueFormatted?: string;
    };
  };
}
