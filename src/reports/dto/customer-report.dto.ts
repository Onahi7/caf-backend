import { IsOptional, IsString, IsDateString, IsEnum } from 'class-validator';

export enum CustomerReportGroupBy {
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month',
}

export class CustomerReportDto {
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
  @IsEnum(CustomerReportGroupBy)
  groupBy?: CustomerReportGroupBy;
}

export interface CustomerReportResult {
  branchId?: string;
  currencyCode?: string;
  totalCustomers: number;
  activeCustomers: number;
  newCustomers: number;
  totalLoyaltyPoints: number;
  topCustomers: Array<{
    customerId: string;
    customerName: string;
    totalPurchases: number;
    totalPurchasesFormatted?: string;
    purchaseCount: number;
    loyaltyPoints: number;
  }>;
  byPeriod: Array<{
    date: string;
    newCustomers: number;
    totalPurchases: number;
    totalPurchasesFormatted?: string;
  }>;
  segmentation: {
    highValue: number;
    medium: number;
    low: number;
    inactive: number;
  };
}
