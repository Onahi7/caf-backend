import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RecurringInvoicesController } from './recurring-invoices.controller.js';
import { RecurringInvoicesService } from './recurring-invoices.service.js';
import {
  RecurringInvoice,
  RecurringInvoiceSchema,
} from './schemas/recurring-invoice.schema.js';
import { ProformaInvoicesModule } from '../proforma-invoices/proforma-invoices.module.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: RecurringInvoice.name, schema: RecurringInvoiceSchema },
    ]),
    ProformaInvoicesModule,
  ],
  controllers: [RecurringInvoicesController],
  providers: [RecurringInvoicesService],
  exports: [RecurringInvoicesService],
})
export class RecurringInvoicesModule {}
