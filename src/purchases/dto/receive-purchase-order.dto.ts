import {
  IsNotEmpty,
  IsString,
  IsNumber,
  IsDateString,
  IsMongoId,
  IsArray,
  ValidateNested,
  Min,
  IsOptional,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ReceivedItemDto {
  @IsNotEmpty()
  @IsMongoId()
  productId!: string;

  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  receivedQuantity!: number;

  @IsOptional()
  @IsDateString()
  expiryDate?: string;

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  sellingPrice!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  purchasePrice?: number;

  @IsOptional()
  @IsDateString()
  supplyDate?: string;
}

export class ReceivePurchaseOrderDto {
  @IsNotEmpty()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReceivedItemDto)
  receivedItems!: ReceivedItemDto[];

  @IsNotEmpty()
  @IsMongoId()
  receivedBy!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
