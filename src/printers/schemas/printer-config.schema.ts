import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PrinterConfigDocument = PrinterConfig & Document;

/**
 * Printer connection types
 */
export enum PrinterConnectionType {
  USB = 'usb',
  NETWORK = 'network',
  BLUETOOTH = 'bluetooth',
  SERIAL = 'serial',
}

/**
 * Printer models/manufacturers
 */
export enum PrinterModel {
  EPSON = 'epson',
  STAR = 'star',
  BIXOLON = 'bixolon',
  CITIZEN = 'citizen',
  GENERIC_ESC_POS = 'generic_esc_pos',
}

/**
 * Printer Configuration Schema
 * Stores thermal printer settings per branch/terminal
 */
@Schema({ timestamps: true })
export class PrinterConfig {
  @Prop({ type: Types.ObjectId, ref: 'Branch', required: true, index: true })
  branchId!: Types.ObjectId;

  @Prop({ required: true })
  terminalId!: string;

  @Prop({ required: true })
  name!: string;

  @Prop({ required: true, enum: PrinterModel, type: String })
  model!: PrinterModel;

  @Prop({ required: true, enum: PrinterConnectionType, type: String })
  connectionType!: PrinterConnectionType;

  /**
   * Paper width in mm (58 or 80)
   */
  @Prop({ required: true, enum: [58, 80] })
  paperWidth!: 58 | 80;

  /**
   * Network printer settings
   */
  @Prop()
  ipAddress?: string;

  @Prop()
  port?: number;

  /**
   * Bluetooth printer settings (for mobile)
   */
  @Prop()
  bluetoothAddress?: string;

  @Prop()
  bluetoothName?: string;

  /**
   * USB/Serial settings
   */
  @Prop()
  serialPort?: string;

  @Prop()
  baudRate?: number;

  /**
   * Printer capabilities
   */
  @Prop({ default: true })
  supportsCut!: boolean;

  @Prop({ default: true })
  supportsLogo!: boolean;

  @Prop({ default: false })
  supportsQRCode!: boolean;

  /**
   * Auto-print settings
   */
  @Prop({ default: false })
  autoPrintEnabled!: boolean;

  @Prop({ default: 1 })
  defaultCopies!: number;

  /**
   * Active status
   */
  @Prop({ default: true })
  isActive!: boolean;

  /**
   * Last connection test
   */
  @Prop()
  lastTestAt?: Date;

  @Prop()
  lastTestStatus?: 'success' | 'failed';

  @Prop()
  lastTestError?: string;

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}

export const PrinterConfigSchema = SchemaFactory.createForClass(PrinterConfig);

// Compound indexes
PrinterConfigSchema.index({ branchId: 1, terminalId: 1 });
PrinterConfigSchema.index({ branchId: 1, isActive: 1 });
