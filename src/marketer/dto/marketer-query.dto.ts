import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsMongoId, IsOptional, Max, Min } from 'class-validator';
import { MarketerAssignmentStatus } from '../schemas/marketer-product-assignment.schema.js';

export class MarketerAssignmentQueryDto {
  @IsOptional()
  @IsMongoId()
  branchId?: string;

  @IsOptional()
  @IsMongoId()
  marketerId?: string;

  @IsOptional()
  @IsMongoId()
  productId?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  activeOnly?: boolean;

  @IsOptional()
  @IsEnum(MarketerAssignmentStatus)
  status?: MarketerAssignmentStatus;
}

export class MarketerSalesQueryDto {
  @IsOptional()
  @IsMongoId()
  branchId?: string;

  @IsOptional()
  @IsMongoId()
  marketerId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}
