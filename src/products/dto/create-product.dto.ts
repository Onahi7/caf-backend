import {
  IsString,
  IsNumber,
  IsBoolean,
  IsOptional,
  Min,
  IsMongoId,
  IsDateString,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PackSizeDto } from './product-pack-size.dto.js';

export class CreateProductDto {
  @IsMongoId()
  branchId!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  sku?: string;

  @IsString()
  barcode!: string;

  @IsString()
  category!: string;

  @IsString()
  brand!: string;

  @IsString()
  unit!: string;

  @IsNumber()
  @Min(0)
  reorderLevel!: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  maxStockLevel?: number;

  @IsNumber()
  @Min(0)
  basePrice!: number;

  @IsNumber()
  @Min(0)
  costPrice!: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  suggestedRetailPrice?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  markupPercentage?: number;

  @IsBoolean()
  @IsOptional()
  requiresPrescription?: boolean;

  @IsBoolean()
  @IsOptional()
  isControlled?: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PackSizeDto)
  @IsOptional()
  packSizes?: PackSizeDto[];

  @IsNumber()
  @Min(0)
  @IsOptional()
  initialStock?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  initialPurchasePrice?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  initialSellingPrice?: number;

  @IsString()
  @IsOptional()
  initialLotNumber?: string;

  @IsDateString()
  @IsOptional()
  initialExpiryDate?: string;

  @IsMongoId()
  @IsOptional()
  initialSupplierId?: string;

  @IsMongoId()
  @IsOptional()
  supplierId?: string;

  @IsDateString()
  @IsOptional()
  initialSupplyDate?: string;
}
