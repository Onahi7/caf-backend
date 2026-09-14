import { IsOptional, IsString, IsDateString, IsEnum } from 'class-validator';

export enum PurchaseReportGroupBy {
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month',
}

export class PurchaseReportDto {
  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsEnum(PurchaseReportGroupBy)
  groupBy?: PurchaseReportGroupBy;
}

export interface PurchaseReportResult {
  branchId?: string;
  currencyCode?: string;
  totalPurchases: number;
  totalAmount: number;
  totalAmountFormatted?: string;
  totalItems: number;
  bySupplier: Array<{
    supplierId: string;
    supplierName: string;
    purchaseCount: number;
    totalAmount: number;
    totalAmountFormatted?: string;
  }>;
  byProduct: Array<{
    productId: string;
    productName: string;
    quantity: number;
    totalAmount: number;
    totalAmountFormatted?: string;
  }>;
  byPeriod: Array<{
    date: string;
    purchaseCount: number;
    amount: number;
    amountFormatted?: string;
  }>;
}
