import { IsMongoId, IsOptional, IsString, IsArray, ValidateNested, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateOrderItemDto {
  @IsNumber()
  @Min(0)
  index!: number;

  @IsMongoId()
  @IsOptional()
  matchedProductId?: string;

  @IsString()
  @IsOptional()
  status?: string;
}

export class UpdateCustomerOrderDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateOrderItemDto)
  @IsOptional()
  items?: UpdateOrderItemDto[];

  @IsString()
  @IsOptional()
  notes?: string;
}

export class CustomerOrderFilterDto {
  @IsMongoId()
  @IsOptional()
  branchId?: string;

  @IsString()
  @IsOptional()
  status?: string;

  @IsOptional()
  startDate?: string;

  @IsOptional()
  endDate?: string;

  @IsOptional()
  page?: number;

  @IsOptional()
  limit?: number;
}
