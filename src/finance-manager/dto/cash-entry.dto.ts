import { IsEnum, IsMongoId, IsNumber, IsOptional, IsString, IsDateString, Min, MaxLength } from 'class-validator';
import { CashEntryType, CashEntryCategory } from '../schema/cash-entry.schema.js';

export class CreateCashEntryDto {
  @IsEnum(CashEntryType)
  type!: CashEntryType;

  @IsEnum(CashEntryCategory)
  category!: CashEntryCategory;

  @IsMongoId()
  branchId!: string;

  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsString()
  @MaxLength(500)
  description!: string;

  @IsString()
  @MaxLength(1000)
  @IsOptional()
  notes?: string;

  @IsString()
  @MaxLength(200)
  @IsOptional()
  receiptNumber?: string;

  @IsString()
  @MaxLength(200)
  @IsOptional()
  referenceId?: string;

  @IsDateString()
  @IsOptional()
  entryDate?: string;
}

export class CashEntryFilterDto {
  @IsMongoId()
  @IsOptional()
  branchId?: string;

  @IsEnum(CashEntryType)
  @IsOptional()
  type?: CashEntryType;

  @IsEnum(CashEntryCategory)
  @IsOptional()
  category?: CashEntryCategory;

  @IsString()
  @IsOptional()
  startDate?: string;

  @IsString()
  @IsOptional()
  endDate?: string;

  @IsString()
  @IsOptional()
  page?: string;

  @IsString()
  @IsOptional()
  limit?: string;
}
