import { IsOptional, IsString, IsDateString } from 'class-validator';

export class ProfitLossReportDto {
  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

export interface ProfitLossReportResult {
  branchId?: string;
  currencyCode?: string;
  revenue: {
    totalSales: number;
    totalReturns: number;
    netRevenue: number;
    netRevenueFormatted?: string;
  };
  costOfGoodsSold: {
    totalCOGS: number;
    totalCOGSFormatted?: string;
  };
  grossProfit: {
    amount: number;
    amountFormatted?: string;
    margin: number;
  };
  expenses: {
    totalExpenses: number;
    totalExpensesFormatted?: string;
    byCategory: Array<{
      category: string;
      total: number;
      totalFormatted?: string;
      count: number;
    }>;
  };
  operatingProfit: {
    amount: number;
    amountFormatted?: string;
    margin: number;
  };
  period: {
    from: string;
    to: string;
  };
}
