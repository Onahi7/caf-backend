import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FinanceController } from './finance.controller.js';
import { FinanceRepository } from './finance.repository.js';
import { FinanceService } from './finance.service.js';
import {
  FinanceTransaction,
  FinanceTransactionSchema,
} from './schemas/finance-transaction.schema.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: FinanceTransaction.name,
        schema: FinanceTransactionSchema,
      },
    ]),
  ],
  controllers: [FinanceController],
  providers: [FinanceService, FinanceRepository],
  exports: [FinanceService, FinanceRepository],
})
export class FinanceModule {}
