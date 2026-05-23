import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ProformaInvoice, ProformaInvoiceSchema } from './schemas/proforma-invoice.schema.js';
import { ProformaInvoicesController } from './proforma-invoices.controller.js';
import { ProformaInvoicesService } from './proforma-invoices.service.js';
import { ProformaInvoicesRepository } from './proforma-invoices.repository.js';
import { CommonServicesModule } from '../common/services/common-services.module.js';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: ProformaInvoice.name, schema: ProformaInvoiceSchema }]),
    CommonServicesModule,
  ],
  controllers: [ProformaInvoicesController],
  providers: [ProformaInvoicesService, ProformaInvoicesRepository],
  exports: [ProformaInvoicesService],
})
export class ProformaInvoicesModule {}
