import {
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
import { ExpenseCategory } from '../schemas/expense.schema.js';

export class CreateExpenseDto {
  @IsMongoId()
  @IsNotEmpty()
  branchId!: string;

  @IsMongoId()
  @IsNotEmpty()
  shiftId!: string;

  @IsMongoId()
  @IsNotEmpty()
  recordedBy!: string;

  @IsNumber()
  @Min(0.01)
  @Max(1000000)
  amount!: number;

  @IsEnum(ExpenseCategory)
  @IsNotEmpty()
  category!: ExpenseCategory;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  description!: string;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  notes?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  receiptNumber?: string;
}
