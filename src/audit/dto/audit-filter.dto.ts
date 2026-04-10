import { IsOptional, IsString, IsEnum, IsDateString } from 'class-validator';
import { AuditAction, AuditResource } from '../schemas/audit-log.schema.js';

export class AuditFilterDto {
  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsEnum(AuditAction)
  action?: AuditAction;

  @IsOptional()
  @IsEnum(AuditResource)
  resource?: AuditResource;

  @IsOptional()
  @IsString()
  resourceId?: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  limit?: string;
}

export class CreateAuditLogDto {
  userId!: string;
  username!: string;
  action!: AuditAction;
  resource!: AuditResource;
  resourceId?: string;
  branchId?: string;
  description!: string;
  previousData?: Record<string, unknown>;
  newData?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}
