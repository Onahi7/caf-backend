import {
  IsString,
  IsNumber,
  IsBoolean,
  IsOptional,
  Min,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class PackSizeDto {
  @IsString()
  name!: string;

  @IsString()
  unit!: string;

  @IsNumber()
  @Min(1)
  quantityPerPack!: number;

  @IsNumber()
  @Min(0)
  sellingPrice!: number;

  @IsString()
  @IsOptional()
  barcode?: string;
}

export class UpdateProductDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  sku?: string;

  @IsString()
  @IsOptional()
  barcode?: string;

  @IsString()
  @IsOptional()
  category?: string;

  @IsString()
  @IsOptional()
  brand?: string;

  @IsString()
  @IsOptional()
  unit?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  reorderLevel?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  maxStockLevel?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  basePrice?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  costPrice?: number;

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

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
