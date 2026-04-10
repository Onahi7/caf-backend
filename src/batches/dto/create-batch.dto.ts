import {
  IsNotEmpty,
  IsString,
  IsNumber,
  IsDate,
  IsMongoId,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateBatchDto {
  @IsNotEmpty()
  @IsMongoId()
  productId!: string;

  @IsNotEmpty()
  @IsMongoId()
  branchId!: string;

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
  quantity!: number;

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  purchasePrice!: number;

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  sellingPrice!: number;

  @IsNotEmpty()
  @IsMongoId()
  supplierId!: string;
}
