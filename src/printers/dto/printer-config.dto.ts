import {
  IsString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsBoolean,
  IsIP,
  Min,
  Max,
  IsMongoId,
} from 'class-validator';
import { PrinterModel, PrinterConnectionType } from '../schemas/printer-config.schema.js';

export class CreatePrinterConfigDto {
  @IsMongoId()
  branchId!: string;

  @IsString()
  terminalId!: string;

  @IsString()
  name!: string;

  @IsEnum(PrinterModel)
  model!: PrinterModel;

  @IsEnum(PrinterConnectionType)
  connectionType!: PrinterConnectionType;

  @IsNumber()
  @IsEnum([58, 80])
  paperWidth!: 58 | 80;

  // Network settings
  @IsIP()
  @IsOptional()
  ipAddress?: string;

  @IsNumber()
  @Min(1)
  @Max(65535)
  @IsOptional()
  port?: number;

  // Bluetooth settings
  @IsString()
  @IsOptional()
  bluetoothAddress?: string;

  @IsString()
  @IsOptional()
  bluetoothName?: string;

  // Serial settings
  @IsString()
  @IsOptional()
  serialPort?: string;

  @IsNumber()
  @IsOptional()
  baudRate?: number;

  // Capabilities
  @IsBoolean()
  @IsOptional()
  supportsCut?: boolean;

  @IsBoolean()
  @IsOptional()
  supportsLogo?: boolean;

  @IsBoolean()
  @IsOptional()
  supportsQRCode?: boolean;

  // Auto-print
  @IsBoolean()
  @IsOptional()
  autoPrintEnabled?: boolean;

  @IsNumber()
  @Min(1)
  @Max(10)
  @IsOptional()
  defaultCopies?: number;
}

export class UpdatePrinterConfigDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsEnum(PrinterModel)
  @IsOptional()
  model?: PrinterModel;

  @IsEnum(PrinterConnectionType)
  @IsOptional()
  connectionType?: PrinterConnectionType;

  @IsNumber()
  @IsEnum([58, 80])
  @IsOptional()
  paperWidth?: 58 | 80;

  @IsIP()
  @IsOptional()
  ipAddress?: string;

  @IsNumber()
  @Min(1)
  @Max(65535)
  @IsOptional()
  port?: number;

  @IsString()
  @IsOptional()
  bluetoothAddress?: string;

  @IsString()
  @IsOptional()
  bluetoothName?: string;

  @IsString()
  @IsOptional()
  serialPort?: string;

  @IsNumber()
  @IsOptional()
  baudRate?: number;

  @IsBoolean()
  @IsOptional()
  supportsCut?: boolean;

  @IsBoolean()
  @IsOptional()
  supportsLogo?: boolean;

  @IsBoolean()
  @IsOptional()
  supportsQRCode?: boolean;

  @IsBoolean()
  @IsOptional()
  autoPrintEnabled?: boolean;

  @IsNumber()
  @Min(1)
  @Max(10)
  @IsOptional()
  defaultCopies?: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
