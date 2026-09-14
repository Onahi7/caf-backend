import { IsArray, IsMongoId, IsNumber, IsOptional, Min, ValidateNested } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { SaleItemDto } from './create-sale.dto.js';

export class CheckoutQuoteDto {
  @IsMongoId()
  @IsOptional()
  branchId?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SaleItemDto)
  items!: SaleItemDto[];

  @Transform(({ value }) => (value === '' || value === null || value === 'null' ? undefined : value))
  @IsMongoId()
  @IsOptional()
  promotionId?: string;

  @Transform(({ value }) => (typeof value === 'string' ? parseFloat(value) : value))
  @IsNumber()
  @Min(0)
  @IsOptional()
  discount?: number;
}
