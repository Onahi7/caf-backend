import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RecurringInvoicesController } from './recurring-invoices.controller.js';
import { RecurringInvoicesService } from './recurring-invoices.service.js';
import {
  RecurringInvoice,
  RecurringInvoiceSchema,
} from './schemas/recurring-invoice.schema.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: RecurringInvoice.name, schema: RecurringInvoiceSchema },
    ]),
  ],
  controllers: [RecurringInvoicesController],
  providers: [RecurringInvoicesService],
  exports: [RecurringInvoicesService],
})
export class RecurringInvoicesModule {}
