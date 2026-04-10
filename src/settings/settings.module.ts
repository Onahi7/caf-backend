import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SettingsController } from './settings.controller.js';
import { SettingsService } from './settings.service.js';
import {
  SystemSettings,
  SystemSettingsSchema,
} from './schemas/system-settings.schema.js';
import { TaxConfig, TaxConfigSchema } from './schemas/tax-config.schema.js';
import {
  PaymentMethodConfig,
  PaymentMethodConfigSchema,
} from './schemas/payment-method-config.schema.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SystemSettings.name, schema: SystemSettingsSchema },
      { name: TaxConfig.name, schema: TaxConfigSchema },
      { name: PaymentMethodConfig.name, schema: PaymentMethodConfigSchema },
    ]),
  ],
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
