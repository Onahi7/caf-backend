import {
  IsString,
  IsEmail,
  IsBoolean,
  IsOptional,
  ValidateNested,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';
import { BranchConfigDto } from './create-branch.dto.js';
import { BranchCurrency } from '../schemas/branch.schema.js';

export class UpdateBranchDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  code?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

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

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
