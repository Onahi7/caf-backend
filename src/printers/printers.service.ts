import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { createConnection, isIP } from 'node:net';
import {
  PrinterConfig,
  PrinterConfigDocument,
} from './schemas/printer-config.schema.js';
import {
  CreatePrinterConfigDto,
  UpdatePrinterConfigDto,
} from './dto/printer-config.dto.js';

@Injectable()
export class PrintersService {
  constructor(
    @InjectModel(PrinterConfig.name)
    private printerConfigModel: Model<PrinterConfigDocument>,
  ) {}

  async create(
    createDto: CreatePrinterConfigDto,
  ): Promise<PrinterConfigDocument> {
    const config = new this.printerConfigModel(createDto);
    return config.save();
  }

  async findAll(): Promise<PrinterConfigDocument[]> {
    return this.printerConfigModel.find().populate('branchId').exec();
  }

  async findByBranch(branchId: string): Promise<PrinterConfigDocument[]> {
    return this.printerConfigModel
      .find({ branchId, isActive: true })
      .populate('branchId')
      .exec();
  }

  async findByTerminal(
    branchId: string,
    terminalId: string,
  ): Promise<PrinterConfigDocument | null> {
    return this.printerConfigModel
      .findOne({ branchId, terminalId, isActive: true })
      .populate('branchId')
      .exec();
  }

  async findById(id: string): Promise<PrinterConfigDocument | null> {
    return this.printerConfigModel.findById(id).populate('branchId').exec();
  }

  async update(
    id: string,
    updateDto: UpdatePrinterConfigDto,
  ): Promise<PrinterConfigDocument | null> {
    return this.printerConfigModel
      .findByIdAndUpdate(id, updateDto, { new: true })
      .populate('branchId')
      .exec();
  }

  async delete(id: string): Promise<PrinterConfigDocument | null> {
    return this.printerConfigModel.findByIdAndDelete(id).exec();
  }

  async testConnection(id: string): Promise<{
    success: boolean;
    message: string;
  }> {
    const config = await this.findById(id);
    if (!config) {
      return { success: false, message: 'Printer config not found' };
    }

    try {
      // Test connection based on type
      switch (config.connectionType) {
        case 'network':
          if (!config.ipAddress || !config.port) {
            throw new Error('Network settings not configured');
          }
          await this.sendNetwork(config.ipAddress, config.port);
          break;

        case 'bluetooth':
          if (!config.bluetoothAddress) {
            throw new Error('Bluetooth address not configured');
          }
          throw new Error('Bluetooth connection must be tested from the native device');

        case 'usb':
        case 'serial':
          if (!config.serialPort) {
            throw new Error('Serial port not configured');
          }
          throw new Error('Serial/USB connection must be tested from the native device');
      }

      // Update last test status
      await this.printerConfigModel.findByIdAndUpdate(id, {
        lastTestAt: new Date(),
        lastTestStatus: 'success',
        lastTestError: null,
      });

      return {
        success: true,
        message: 'Printer TCP connection established successfully',
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      // Update last test status
      await this.printerConfigModel.findByIdAndUpdate(id, {
        lastTestAt: new Date(),
        lastTestStatus: 'failed',
        lastTestError: errorMessage,
      });

      return {
        success: false,
        message: `Connection test failed: ${errorMessage}`,
      };
    }
  }

  async networkPrint(payload: {
    ipAddress: string;
    port: number;
    data: number[];
  }, branchId?: string): Promise<{ success: boolean; message: string }> {
    if (!isIP(payload.ipAddress || '') || !Number.isInteger(payload.port) || payload.port < 1 || payload.port > 65535 || !Array.isArray(payload.data) || !payload.data.length || payload.data.length > 1048576 || payload.data.some(byte => !Number.isInteger(byte) || byte < 0 || byte > 255)) {
      return {
        success: false,
        message: 'Invalid print payload',
      };
    }

    const configured = await this.printerConfigModel.findOne({ ipAddress: payload.ipAddress, port: payload.port, connectionType: 'network', isActive: true, ...(branchId ? { branchId } : {}) }).exec();
    if (!configured) return { success: false, message: 'No active printer is configured for this destination' };
    try {
      await this.sendNetwork(payload.ipAddress, payload.port, Buffer.from(payload.data));
      return { success: true, message: 'Print bytes delivered to printer TCP connection' };
    } catch (error) {
      return { success: false, message: `Print delivery failed: ${error instanceof Error ? error.message : 'Unknown error'}` };
    }
  }

  private sendNetwork(host: string, port: number, data?: Buffer): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = createConnection({ host, port });
      const timer = setTimeout(() => { socket.destroy(); reject(new Error('Printer connection timed out')); }, 5000);
      const finish = (error?: Error) => {
        clearTimeout(timer);
        socket.destroy();
        if (error) reject(error); else resolve();
      };
      socket.once('error', finish);
      socket.once('connect', () => {
        if (data) socket.end(data, () => finish());
        else finish();
      });
    });
  }
}
