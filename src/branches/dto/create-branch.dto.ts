import {
  IsString,
  IsEmail,
  IsBoolean,
  IsOptional,
  IsNumber,
  IsArray,
  ValidateNested,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';
import { BranchCurrency } from '../schemas/branch.schema.js';

export class BranchConfigDto {
  @IsNumber()
  @IsOptional()
  reorderThreshold?: number;

  @IsArray()
  @IsNumber({}, { each: true })
  @IsOptional()
  expiryAlertDays?: number[];

  @IsBoolean()
  @IsOptional()
  allowNegativeStock?: boolean;
}

export class CreateBranchDto {
  @IsString()
  name!: string;

  @IsString()
  code!: string;

  @IsString()
  address!: string;

  @IsString()
  phone!: string;

  @IsEmail()
  email!: string;

  @IsEnum(BranchCurrency)
  @IsOptional()
  currencyCode?: BranchCurrency;

  @IsBoolean()
  @IsOptional()
  isHeadquarters?: boolean;

  @ValidateNested()
  @Type(() => BranchConfigDto)
  @IsOptional()
  config?: BranchConfigDto;
}
