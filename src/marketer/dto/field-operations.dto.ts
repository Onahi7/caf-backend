import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { FieldZoneCode } from '../schemas/field-zone.schema.js';
import {
  FacilityGrade,
  FacilityStatus,
  FacilityType,
  HarborStatus,
} from '../schemas/facility.schema.js';
import { FieldVisitCode } from '../schemas/field-visit.schema.js';

export class FacilityLocationDto {
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  landmark?: string;
}

export class CreateFacilityDto {
  @IsString()
  @MaxLength(160)
  name!: string;

  @IsEnum(FacilityType)
  type!: FacilityType;

  @IsEnum(FieldZoneCode)
  zoneCode!: FieldZoneCode;

  @IsString()
  @MaxLength(120)
  neighbourhood!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => FacilityLocationDto)
  location?: FacilityLocationDto;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  inChargeName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  inChargePhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  buyerName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  buyerPhone?: string;

  @IsOptional()
  @IsEnum(FacilityGrade)
  grade?: FacilityGrade;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  gradeReason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  surfaceDisinfectant?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  testsRunVsReferred?: string;

  @IsOptional()
  @IsEnum(HarborStatus)
  harborStatus?: HarborStatus;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  bestVisitTime?: string;

  @IsOptional()
  @IsMongoId()
  branchId?: string;

  @IsOptional()
  @IsMongoId()
  assignedMarketerId?: string;

  @IsOptional()
  @IsEnum(FacilityStatus)
  status?: FacilityStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class FacilityQueryDto {
  @IsOptional()
  @IsEnum(FieldZoneCode)
  zoneCode?: FieldZoneCode;

  @IsOptional()
  @IsEnum(FacilityStatus)
  status?: FacilityStatus;

  @IsOptional()
  @IsMongoId()
  assignedMarketerId?: string;

  @IsOptional()
  @IsMongoId()
  branchId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}

export class FieldVisitProductLineDto {
  @IsOptional()
  @IsMongoId()
  productId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  quantity?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  unitPrice?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;
}

export class CreateFieldVisitDto {
  @IsMongoId()
  facilityId!: string;

  @IsEnum(FieldVisitCode)
  visitType!: FieldVisitCode;

  @IsOptional()
  @IsDateString()
  visitedAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  personName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  personPhone?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => FieldVisitProductLineDto)
  products?: FieldVisitProductLineDto[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  cashCollected?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  balanceDue?: number;

  @IsOptional()
  @IsDateString()
  nextActionDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  nextAction?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  harborNotes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  trainingAttendance?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  photoUrls?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class FieldVisitQueryDto {
  @IsOptional()
  @IsEnum(FieldVisitCode)
  visitType?: FieldVisitCode;

  @IsOptional()
  @IsMongoId()
  facilityId?: string;

  @IsOptional()
  @IsMongoId()
  marketerId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}

export class DailyFieldReportStopDto {
  @IsString()
  @MaxLength(160)
  facility!: string;

  @IsString()
  @MaxLength(120)
  neighbourhood!: string;

  @IsEnum(FieldVisitCode)
  type!: FieldVisitCode;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  personPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  soldDiscussed?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  cash?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  balance?: number;

  @IsOptional()
  @IsDateString()
  nextDate?: string;
}

export class UpsertDailyFieldReportDto {
  @IsDateString()
  reportDate!: string;

  @IsEnum(FieldZoneCode)
  zoneCode!: FieldZoneCode;

  @IsOptional()
  @IsNumber()
  @Min(0)
  bikeKmStart?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  bikeKmEnd?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  chargeAm?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  chargePm?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  cashAtClose?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => DailyFieldReportStopDto)
  stops?: DailyFieldReportStopDto[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  harborToday?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  stockMissing?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  bikeIssues?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  tomorrowStopOne?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  tomorrowStopTwo?: string;
}

export class DailyFieldReportQueryDto {
  @IsOptional()
  @IsMongoId()
  marketerId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}
