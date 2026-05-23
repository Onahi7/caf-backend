import {
  IsMongoId, IsOptional, IsString, IsArray, ValidateNested,
  IsNumber, Min, IsEnum, IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentMethod } from '../schemas/proforma-invoice.schema.js';

export class CreateProformaItemDto {
  @IsMongoId()
  productId!: string;

  @IsString()
  productName!: string;

  @IsNumber()
  @Min(1)
  quantity!: number;

  @IsNumber()
  @Min(0)
  unitPrice!: number;
}

export class CreateProformaDto {
  @IsMongoId()
  @IsOptional()
  customerOrderId?: string;

  @IsMongoId()
  customerId!: string;

  @IsMongoId()
  branchId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateProformaItemDto)
  items!: CreateProformaItemDto[];

  @IsNumber()
  @Min(0)
  @IsOptional()
  taxRate?: number;

  @IsDateString()
  validUntil!: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  terms?: string;
}

export class RecordPaymentDto {
  @IsNumber()
  @Min(0)
  amount!: number;

  @IsEnum(PaymentMethod)
  method!: PaymentMethod;

  @IsString()
  @IsOptional()
  reference?: string;
}

export class ConvertToSaleDto {
  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;

  @IsNumber()
  @Min(0)
  @IsOptional()
  amountPaid?: number;
}

export class ProformaFilterDto {
  @IsMongoId()
  @IsOptional()
  branchId?: string;

  @IsString()
  @IsOptional()
  status?: string;

  @IsMongoId()
  @IsOptional()
  customerId?: string;

  @IsOptional()
  startDate?: string;

  @IsOptional()
  endDate?: string;
}
