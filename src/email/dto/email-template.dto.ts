import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class CreateEmailTemplateDto {
  @IsString()
  name!: string;

  @IsString()
  subject!: string;

  @IsString()
  body!: string;

  @IsString()
  type!: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateEmailTemplateDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  subject?: string;

  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
