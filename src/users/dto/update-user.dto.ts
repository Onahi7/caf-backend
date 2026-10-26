import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
  IsMongoId,
} from 'class-validator';
import { UserRole } from '../schemas/user.schema.js';
import { FieldZoneCode } from '../../marketer/schemas/field-zone.schema.js';

export class UpdateUserDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsMongoId()
  branchId?: string | null;

  @IsOptional()
  @IsEnum(FieldZoneCode)
  fieldZoneCode?: FieldZoneCode | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MinLength(6, { message: 'Password must be at least 6 characters long' })
  password?: string;
}
