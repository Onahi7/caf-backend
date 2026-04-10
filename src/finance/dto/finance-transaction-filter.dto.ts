import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { FinanceTransactionType } from '../schemas/finance-transaction.schema.js';

export class FinanceTransactionFilterDto {
  @IsMongoId()
  @IsOptional()
  branchId?: string;

  @IsEnum(FinanceTransactionType)
  @IsOptional()
  type?: FinanceTransactionType;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  category?: string;

  @IsMongoId()
  @IsOptional()
  marketerId?: string;

  @IsMongoId()
  @IsOptional()
  recordedBy?: string;

  @IsDateString()
  @IsOptional()
  startDate?: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  @IsOptional()
  limit?: number;
}
