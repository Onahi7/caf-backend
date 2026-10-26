import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
  IsMongoId,
} from 'class-validator';
import { UserRole } from '../schemas/user.schema.js';
import { FieldZoneCode } from '../../marketer/schemas/field-zone.schema.js';

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  username!: string;

  @IsString()
  @MinLength(6, { message: 'Password must be at least 6 characters long' })
  password!: string;

  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @IsString()
  @IsNotEmpty()
  firstName!: string;

  @IsString()
  @IsNotEmpty()
  lastName!: string;

  @IsEnum(UserRole)
  role!: UserRole;

  @IsOptional()
  @IsMongoId()
  branchId?: string;

  @IsOptional()
  @IsEnum(FieldZoneCode)
  fieldZoneCode?: FieldZoneCode;
}
