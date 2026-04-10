import { IsEnum, IsMongoId, IsOptional, IsDateString } from 'class-validator';
import { ExpenseCategory } from '../schemas/expense.schema.js';

export class ExpenseFilterDto {
  @IsMongoId()
  @IsOptional()
  branchId?: string;

  @IsMongoId()
  @IsOptional()
  shiftId?: string;

  @IsMongoId()
  @IsOptional()
  recordedBy?: string;

  @IsEnum(ExpenseCategory)
  @IsOptional()
  category?: ExpenseCategory;

  @IsDateString()
  @IsOptional()
  startDate?: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;
}
