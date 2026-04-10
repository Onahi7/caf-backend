import {
  IsNotEmpty,
  IsString,
  IsArray,
  ValidateNested,
  IsNumber,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

class CheckStockItemDto {
  @IsNotEmpty()
  @IsString()
  productId!: string;

  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  quantity!: number;
}

export class CheckStockDto {
  @IsNotEmpty()
  @IsString()
  branchId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CheckStockItemDto)
  items!: CheckStockItemDto[];
}
