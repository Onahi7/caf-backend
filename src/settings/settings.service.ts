import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UpdateSystemSettingsDto } from './dto/system-settings.dto.js';
import {
  CreateTaxConfigDto,
  UpdateTaxConfigDto,
} from './dto/tax-config.dto.js';
import {
  CreatePaymentMethodConfigDto,
  UpdatePaymentMethodConfigDto,
} from './dto/payment-method-config.dto.js';
import {
  SystemSettings,
  SystemSettingsDocument,
} from './schemas/system-settings.schema.js';
import { TaxConfig, TaxConfigDocument } from './schemas/tax-config.schema.js';
import {
  PaymentMethodConfig,
  PaymentMethodConfigDocument,
} from './schemas/payment-method-config.schema.js';

@Injectable()
export class SettingsService {
  constructor(
    @InjectModel(SystemSettings.name)
    private readonly systemSettingsModel: Model<SystemSettingsDocument>,
    @InjectModel(TaxConfig.name)
    private readonly taxConfigModel: Model<TaxConfigDocument>,
    @InjectModel(PaymentMethodConfig.name)
    private readonly paymentMethodModel: Model<PaymentMethodConfigDocument>,
  ) {}

  private readonly defaultSettings: Omit<SystemSettings, 'key'> = {
    companyName: 'Pharmacy POS',
    companyAddress: '',
    companyPhone: '',
    companyEmail: '',
    currency: 'NGN',
    timezone: 'Africa/Lagos',
    dateFormat: 'DD/MM/YYYY',
    lowStockThreshold: 10,
    receiptFooter: 'Thank you for your business!',
    enableLoyalty: false,
    loyaltyPointsRate: 1,
    enableEmailNotifications: true,
    enableSMSNotifications: false,
  };

  async getSystemSettings(): Promise<SystemSettingsDocument> {
    let settings = await this.systemSettingsModel.findOne({ key: 'default' }).exec();

    if (!settings) {
      settings = await this.systemSettingsModel.create({
        key: 'default',
        ...this.defaultSettings,
      });
    }

    return settings;
  }

  async updateSystemSettings(
    dto: UpdateSystemSettingsDto,
  ): Promise<SystemSettingsDocument> {
    const updated = await this.systemSettingsModel
      .findOneAndUpdate(
        { key: 'default' },
        {
          $set: dto,
          $setOnInsert: {
            key: 'default',
            ...this.defaultSettings,
          },
        },
        { new: true, upsert: true },
      )
      .exec();

    return updated!;
  }

  async findAllTaxes(): Promise<TaxConfigDocument[]> {
    return this.taxConfigModel.find().sort({ createdAt: -1 }).exec();
  }

  async createTax(dto: CreateTaxConfigDto): Promise<TaxConfigDocument> {
    return this.taxConfigModel.create({
      ...dto,
      applicableCategories: this.normalizeCategories(dto.applicableCategories),
      isActive: dto.isActive ?? true,
    });
  }

  async updateTax(
    id: string,
    dto: UpdateTaxConfigDto,
  ): Promise<TaxConfigDocument> {
    const updated = await this.taxConfigModel
      .findByIdAndUpdate(
        id,
        {
          ...dto,
          ...(dto.applicableCategories !== undefined
            ? {
                applicableCategories: this.normalizeCategories(
                  dto.applicableCategories,
                ),
              }
            : {}),
        },
        { new: true },
      )
      .exec();

    if (!updated) {
      throw new NotFoundException(`Tax configuration ${id} not found`);
    }

    return updated;
  }

  async toggleTaxStatus(id: string): Promise<TaxConfigDocument> {
    const tax = await this.taxConfigModel.findById(id).exec();
    if (!tax) {
      throw new NotFoundException(`Tax configuration ${id} not found`);
    }

    tax.isActive = !tax.isActive;
    return tax.save();
  }

  async deleteTax(id: string): Promise<void> {
    const deleted = await this.taxConfigModel.findByIdAndDelete(id).exec();
    if (!deleted) {
      throw new NotFoundException(`Tax configuration ${id} not found`);
    }
  }

  async findAllPaymentMethods(): Promise<PaymentMethodConfigDocument[]> {
    return this.paymentMethodModel.find().sort({ createdAt: -1 }).exec();
  }

  async createPaymentMethod(
    dto: CreatePaymentMethodConfigDto,
  ): Promise<PaymentMethodConfigDocument> {
    return this.paymentMethodModel.create({
      ...dto,
      isActive: dto.isActive ?? true,
    });
  }

  async updatePaymentMethod(
    id: string,
    dto: UpdatePaymentMethodConfigDto,
  ): Promise<PaymentMethodConfigDocument> {
    const updated = await this.paymentMethodModel
      .findByIdAndUpdate(id, dto, { new: true })
      .exec();

    if (!updated) {
      throw new NotFoundException(`Payment method ${id} not found`);
    }

    return updated;
  }

  async togglePaymentMethodStatus(
    id: string,
  ): Promise<PaymentMethodConfigDocument> {
    const method = await this.paymentMethodModel.findById(id).exec();

    if (!method) {
      throw new NotFoundException(`Payment method ${id} not found`);
    }

    method.isActive = !method.isActive;
    return method.save();
  }

  async deletePaymentMethod(id: string): Promise<void> {
    const deleted = await this.paymentMethodModel.findByIdAndDelete(id).exec();
    if (!deleted) {
      throw new NotFoundException(`Payment method ${id} not found`);
    }
  }

  private normalizeCategories(
    categories?: string[] | string,
  ): string[] | undefined {
    if (categories === undefined) {
      return undefined;
    }

    if (Array.isArray(categories)) {
      return categories
        .map((v) => v.trim())
        .filter((v) => v.length > 0);
    }

    return categories
      .split(',')
      .map((v) => v.trim())
      .filter((v) => v.length > 0);
  }
}
