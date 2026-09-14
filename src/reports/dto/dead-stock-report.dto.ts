import { IsOptional, IsString, IsNumber, Min } from 'class-validator';

export class DeadStockReportDto {
  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  daysWithoutSale?: number = 90;
}

export interface DeadStockReportResult {
  branchId?: string;
  currencyCode?: string;
  summary: {
    totalDeadStockItems: number;
    totalDeadStockValue: number;
    totalDeadStockValueFormatted?: string;
    totalQuantity: number;
  };
  items: Array<{
    productId: string;
    productName?: string;
    sku?: string;
    branchId: string;
    branchName?: string;
    quantityAvailable: number;
    costPrice: number;
    costPriceFormatted?: string;
    totalValue: number;
    totalValueFormatted?: string;
    lastSaleDate?: Date;
    daysSinceLastSale: number;
    expiryDate?: Date;
  }>;
}
