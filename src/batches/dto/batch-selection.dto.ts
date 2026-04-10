import { IsNotEmpty, IsMongoId, IsNumber, Min } from 'class-validator';

export class BatchSelectionDto {
  @IsNotEmpty()
  @IsMongoId()
  productId!: string;

  @IsNotEmpty()
  @IsMongoId()
  branchId!: string;

  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  quantityNeeded!: number;
}

export interface SelectedBatch {
  batchId: string;
  quantity: number;
  sellingPrice: number;
  lotNumber: string;
  expiryDate: Date;
}
