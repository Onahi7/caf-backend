import {
  IsDateString,
  IsEnum,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { FinanceTransactionType } from '../schemas/finance-transaction.schema.js';

export class CreateFinanceTransactionDto {
  @IsMongoId()
  @IsNotEmpty()
  branchId!: string;

  @IsEnum(FinanceTransactionType)
  @IsNotEmpty()
  type!: FinanceTransactionType;

  @IsNumber()
  @Min(0.01)
  @Max(1000000000)
  amount!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  category!: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @IsString()
  @IsOptional()
  @MaxLength(120)
  reference?: string;

  @IsMongoId()
  @IsOptional()
  marketerId?: string;

  @IsDateString()
  @IsOptional()
  transactionDate?: string;
}
