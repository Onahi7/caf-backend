import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { RecurringCadence } from '../schemas/recurring-invoice.schema.js';

export class RecurringItemDto {
  @IsMongoId()
  @IsOptional()
  productId?: string;

  @IsString()
  productName!: string;

  @IsString()
  @IsOptional()
  sku?: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsNumber()
  @Min(0)
  unitPrice!: number;

  @IsNumber()
  @Min(0)
  subtotal!: number;
}

export class CreateRecurringInvoiceDto {
  @IsMongoId()
  branchId!: string;

  @IsMongoId()
  customerId!: string;

  @IsString()
  @IsOptional()
  customerName?: string;

  @IsString()
  @MaxLength(200)
  description!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RecurringItemDto)
  items!: RecurringItemDto[];

  @IsNumber()
  @Min(0)
  total!: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  discount?: number;

  @IsEnum(RecurringCadence)
  cadence!: RecurringCadence;

  @IsDateString()
  nextRunAt!: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  maxRuns?: number;

  @IsDateString()
  @IsOptional()
  endDate?: string;
}

export class UpdateRecurringInvoiceDto {
  @IsString()
  @IsOptional()
  @MaxLength(200)
  description?: string;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => RecurringItemDto)
  items?: RecurringItemDto[];

  @IsNumber()
  @IsOptional()
  total?: number;

  @IsNumber()
  @IsOptional()
  discount?: number;

  @IsEnum(RecurringCadence)
  @IsOptional()
  cadence?: RecurringCadence;

  @IsDateString()
  @IsOptional()
  nextRunAt?: string;

  @IsOptional()
  active?: boolean;

  @IsInt()
  @Min(0)
  @IsOptional()
  maxRuns?: number;

  @IsDateString()
  @IsOptional()
  endDate?: string;
}
