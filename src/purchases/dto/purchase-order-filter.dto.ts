import { IsOptional, IsMongoId, IsEnum, IsDate } from 'class-validator';
import { Type } from 'class-transformer';
import { PurchaseOrderStatus } from '../schemas/purchase-order.schema.js';

export class PurchaseOrderFilterDto {
  @IsOptional()
  @IsMongoId()
  supplierId?: string;

  @IsOptional()
  @IsMongoId()
  branchId?: string;

  @IsOptional()
  @IsEnum(PurchaseOrderStatus)
  status?: PurchaseOrderStatus;

  @IsOptional()
  @IsDate()
  @Type(() => Date)
  startDate?: Date;

  @IsOptional()
  @IsDate()
  @Type(() => Date)
  endDate?: Date;
}
