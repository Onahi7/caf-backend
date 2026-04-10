import { IsString, IsOptional } from 'class-validator';

export class ProductSearchDto {
  @IsString()
  query!: string;

  @IsString()
  @IsOptional()
  category?: string;

  @IsString()
  @IsOptional()
  brand?: string;
}
