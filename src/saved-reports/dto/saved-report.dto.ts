import { IsArray, IsEnum, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { ReportSchedule } from '../schemas/saved-report.schema.js';

export class CreateSavedReportDto {
  @IsString()
  @MaxLength(100)
  name!: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @IsString()
  reportKey!: string;

  @IsString()
  route!: string;

  @IsObject()
  params!: Record<string, unknown>;

  @IsEnum(ReportSchedule)
  @IsOptional()
  schedule?: ReportSchedule;

  @IsArray()
  @IsOptional()
  recipients?: string[];
}

export class UpdateSavedReportDto {
  @IsString()
  @IsOptional()
  @MaxLength(100)
  name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @IsObject()
  @IsOptional()
  params?: Record<string, unknown>;

  @IsEnum(ReportSchedule)
  @IsOptional()
  schedule?: ReportSchedule;

  @IsArray()
  @IsOptional()
  recipients?: string[];
}
