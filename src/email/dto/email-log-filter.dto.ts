import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';

export enum EmailLogStatus {
  PENDING = 'pending',
  SENT = 'sent',
  FAILED = 'failed',
}

export class EmailLogFilterDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(EmailLogStatus)
  status?: EmailLogStatus;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
