import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
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
          // In a real implementation, ping the network printer
          // For now, just validate settings
          break;

        case 'bluetooth':
          if (!config.bluetoothAddress) {
            throw new Error('Bluetooth address not configured');
          }
          // Bluetooth testing requires native mobile SDK
          break;

        case 'usb':
        case 'serial':
          if (!config.serialPort) {
            throw new Error('Serial port not configured');
          }
          // Serial port testing requires native access
          break;
      }

      // Update last test status
      await this.printerConfigModel.findByIdAndUpdate(id, {
        lastTestAt: new Date(),
        lastTestStatus: 'success',
        lastTestError: null,
      });

      return {
        success: true,
        message: 'Printer configuration validated successfully',
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
  }): Promise<{ success: boolean; message: string }> {
    if (!payload.ipAddress || !payload.port || !Array.isArray(payload.data)) {
      return {
        success: false,
        message: 'Invalid print payload',
      };
    }

    // Placeholder behavior: request validated and accepted.
    // Transport-specific print delivery should be implemented by infrastructure adapter.
    return {
      success: true,
      message: `Print job accepted for ${payload.ipAddress}:${payload.port}`,
    };
  }
}
