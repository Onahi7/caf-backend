import { IsOptional, IsString, IsDateString, IsEnum } from 'class-validator';

export enum SalesReportGroupBy {
  BRANCH = 'branch',
  CASHIER = 'cashier',
  PRODUCT = 'product',
  DAY = 'day',
}

/**
 * Sales report filter DTO
 * Requirements: 14.1
 * Property 56: Sales report filtering
 */
export class SalesReportDto {
  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  cashierId?: string;

  @IsOptional()
  @IsString()
  productId?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsEnum(SalesReportGroupBy)
  groupBy?: SalesReportGroupBy;
}

/**
 * Sales report result interface
 * Requirements: 4.1
 * Property 11: Report currency formatting
 * Property 12: Payment method breakdown completeness
 */
export interface SalesReportResult {
  branchId?: string;
  currencyCode?: string;
  summary: {
    totalSales: number;
    totalAmount: number;
    totalAmountFormatted?: string;
    totalDiscount: number;
    totalDiscountFormatted?: string;
    totalReturns: number;
    totalReturnsFormatted?: string;
    netAmount: number;
    netAmountFormatted?: string;
    averageTransaction: number;
    averageTransactionFormatted?: string;
    transactionCount: number;
  };
  paymentMethodBreakdown?: Array<{
    paymentMethod: string;
    label: string;
    count: number;
    totalAmount: number;
    totalAmountFormatted?: string;
  }>;
  breakdown?: Array<{
    _id: string;
    name?: string;
    totalSales: number;
    totalAmount: number;
    totalAmountFormatted?: string;
    transactionCount: number;
  }>;
  topProducts?: Array<{
    productId: string;
    productName?: string;
    quantitySold: number;
    totalAmount: number;
    totalAmountFormatted?: string;
  }>;
}
