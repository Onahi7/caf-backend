import { IsMongoId, IsOptional, IsString, IsArray, ValidateNested, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateDeliveryNoteDto {
  @IsMongoId()
  proformaInvoiceId!: string;

  @IsMongoId()
  customerId!: string;

  @IsMongoId()
  branchId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateDeliveryItemDto)
  items!: CreateDeliveryItemDto[];

  @IsString()
  @IsOptional()
  notes?: string;
}

export class CreateDeliveryItemDto {
  @IsMongoId()
  productId!: string;

  @IsString()
  productName!: string;

  @IsNumber()
  @Min(1)
  quantity!: number;
}

export class DeliveryNoteFilterDto {
  @IsMongoId()
  @IsOptional()
  branchId?: string;

  @IsMongoId()
  @IsOptional()
  proformaInvoiceId?: string;

  @IsString()
  @IsOptional()
  status?: string;
}

export class MarkDeliveredDto {
  @IsOptional()
  deliveredAt?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
