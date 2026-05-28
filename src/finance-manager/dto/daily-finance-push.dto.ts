import { IsString, IsNumber, IsOptional, Min } from 'class-validator';

export class DailyFinancePushDto {
  @IsString()
  source!: string;

  @IsString()
  date!: string;

  @IsNumber()
  @Min(0)
  totalRevenue!: number;

  @IsNumber()
  @Min(0)
  totalExpenses!: number;

  @IsNumber()
  @Min(0)
  netIncome!: number;

  @IsNumber()
  @Min(0)
  cashCollected!: number;

  @IsNumber()
  @Min(0)
  orangeMoneyCollected!: number;

  @IsNumber()
  @Min(0)
  afrimoneyCollected!: number;

  @IsNumber()
  @Min(0)
  outstandingBalance!: number;

  @IsNumber()
  @Min(0)
  orderCount!: number;

  @IsString()
  @IsOptional()
  submittedBy?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
