import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class PackSizeDto {
  @IsString()
  @IsOptional()
  code?: string;

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
