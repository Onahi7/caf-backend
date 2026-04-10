import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export enum TaxType {
  PERCENTAGE = 'percentage',
  FIXED = 'fixed',
}

export class CreateTaxConfigDto {
  @IsString()
  name!: string;

  @IsNumber()
  @Min(0)
  rate!: number;

  @IsEnum(TaxType)
  type!: TaxType;

  @IsOptional()
  applicableCategories?: string[] | string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateTaxConfigDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  rate?: number;

  @IsOptional()
  @IsEnum(TaxType)
  type?: TaxType;

  @IsOptional()
  applicableCategories?: string[] | string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
