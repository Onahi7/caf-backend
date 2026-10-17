import { IsIn, IsOptional } from 'class-validator';

export class ExportQueryDto {
  @IsOptional()
  @IsIn(['pdf', 'excel', 'xlsx', 'csv'])
  format?: string;

  @IsOptional()
  @IsIn(['pdf', 'excel'])
  export?: string;
}
