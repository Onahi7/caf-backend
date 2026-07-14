import { IsArray, IsMongoId, IsNumber, IsOptional, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { SaleItemDto } from './create-sale.dto.js';

export class CheckoutQuoteDto {
  @IsMongoId()
  branchId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SaleItemDto)
  items!: SaleItemDto[];

  @IsMongoId()
  @IsOptional()
  promotionId?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  discount?: number;
}
