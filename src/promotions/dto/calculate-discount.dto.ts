import {
  IsNotEmpty,
  IsString,
  IsArray,
  ValidateNested,
  IsNumber,
  Min,
  IsOptional,
} from 'class-validator';
import { Type } from 'class-transformer';

class CalculateDiscountItemDto {
  @IsNotEmpty()
  @IsString()
  productId!: string;

  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  quantity!: number;

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  unitPrice!: number;

  @IsOptional()
  @IsString()
  category?: string;
}

export class CalculateDiscountDto {
  @IsNotEmpty()
  @IsString()
  promotionId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CalculateDiscountItemDto)
  items!: CalculateDiscountItemDto[];

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  subtotal!: number;
}
