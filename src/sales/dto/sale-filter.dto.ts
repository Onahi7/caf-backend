import {
  IsString,
  IsOptional,
  IsEnum,
  IsDate,
  IsNumber,
  IsMongoId,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  PaymentMethod,
  SaleStatus,
  SaleType,
} from '../schemas/sale.schema.js';

/**
 * DTO for filtering sales queries
 */
export class SaleFilterDto {
  @IsMongoId()
  @IsOptional()
  branchId?: string;

  @IsMongoId()
  @IsOptional()
  shiftId?: string;

  @IsMongoId()
  @IsOptional()
  cashierId?: string;

  @IsMongoId()
  @IsOptional()
  productId?: string;

  @IsEnum(SaleStatus)
  @IsOptional()
  status?: SaleStatus;

  @IsString()
  @IsOptional()
  receiptNumber?: string;

  @IsString()
  @IsOptional()
  search?: string;

  @IsEnum(PaymentMethod)
  @IsOptional()
  paymentMethod?: PaymentMethod;

  @IsEnum(SaleType)
  @IsOptional()
  saleType?: SaleType;

  @IsString()
  @IsOptional()
  @Matches(/^(unpaid|partial|paid|overdue)(,(unpaid|partial|paid|overdue))*$/, {
    message:
      'paymentStatus must be one of unpaid, partial, paid, overdue (comma-separated values allowed)',
  })
  paymentStatus?: string;

  @IsDate()
  @Type(() => Date)
  @IsOptional()
  startDate?: Date;

  @IsDate()
  @Type(() => Date)
  @IsOptional()
  endDate?: Date;

  @IsNumber()
  @IsOptional()
  skip?: number;

  @IsNumber()
  @IsOptional()
  limit?: number;
}
