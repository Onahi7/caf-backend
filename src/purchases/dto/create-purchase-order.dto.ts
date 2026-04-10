import {
  IsNotEmpty,
  IsString,
  IsNumber,
  IsDate,
  IsMongoId,
  IsArray,
  ValidateNested,
  Min,
  IsOptional,
} from 'class-validator';
import { Type } from 'class-transformer';

export class PurchaseOrderItemDto {
  @IsNotEmpty()
  @IsMongoId()
  productId!: string;

  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  quantity!: number;

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  unitPrice!: number;
}

export class CreatePurchaseOrderDto {
  @IsNotEmpty()
  @IsMongoId()
  supplierId!: string;

  @IsNotEmpty()
  @IsMongoId()
  branchId!: string;

  @IsNotEmpty()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderItemDto)
  items!: PurchaseOrderItemDto[];

  @IsNotEmpty()
  @IsDate()
  @Type(() => Date)
  expectedDeliveryDate!: Date;

  @IsNotEmpty()
  @IsMongoId()
  createdBy!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
