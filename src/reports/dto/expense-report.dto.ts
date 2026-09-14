import { IsOptional, IsString, IsDateString, IsEnum } from 'class-validator';

export enum ExpenseReportGroupBy {
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month',
  CATEGORY = 'category',
}

export class ExpenseReportDto {
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
  @IsEnum(ExpenseReportGroupBy)
  groupBy?: ExpenseReportGroupBy;
}

export interface ExpenseReportResult {
  branchId?: string;
  currencyCode?: string;
  summary: {
    totalExpenses: number;
    totalExpensesFormatted?: string;
    totalCount: number;
    averageExpense: number;
    averageExpenseFormatted?: string;
  };
  byCategory: Array<{
    category: string;
    total: number;
    totalFormatted?: string;
    count: number;
    percentage: number;
  }>;
  byPeriod: Array<{
    date: string;
    total: number;
    totalFormatted?: string;
    count: number;
  }>;
  topExpenses: Array<{
    expenseId: string;
    description: string;
    category: string;
    amount: number;
    amountFormatted?: string;
    date: Date;
    recordedByName?: string;
  }>;
}
