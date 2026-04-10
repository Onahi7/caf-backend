import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  PrinterConfig,
  PrinterConfigSchema,
} from './schemas/printer-config.schema.js';
import { PrintersController } from './printers.controller.js';
import { PrintersService } from './printers.service.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PrinterConfig.name, schema: PrinterConfigSchema },
    ]),
  ],
  controllers: [PrintersController],
  providers: [PrintersService],
  exports: [PrintersService],
})
export class PrintersModule {}
