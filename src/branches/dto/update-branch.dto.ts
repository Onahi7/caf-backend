import {
  IsString,
  IsEmail,
  IsBoolean,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { BranchConfigDto } from './create-branch.dto.js';

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
