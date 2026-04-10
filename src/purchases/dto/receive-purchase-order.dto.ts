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

export class ReceivedItemDto {
  @IsNotEmpty()
  @IsMongoId()
  productId!: string;

  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  receivedQuantity!: number;

  @IsNotEmpty()
  @IsString()
  lotNumber!: string;

  @IsNotEmpty()
  @IsDate()
  @Type(() => Date)
  expiryDate!: Date;

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  sellingPrice!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  purchasePrice?: number;
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
