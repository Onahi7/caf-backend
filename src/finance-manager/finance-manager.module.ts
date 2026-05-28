import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Reconciliation, ReconciliationSchema } from './schema/reconciliation.schema.js';
import { Salary, SalarySchema } from './schema/salary.schema.js';
import { CashEntry, CashEntrySchema } from './schema/cash-entry.schema.js';
import { FinanceManagerService } from './finance-manager.service.js';
import { FinanceManagerController } from './finance-manager.controller.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Reconciliation.name, schema: ReconciliationSchema },
      { name: Salary.name, schema: SalarySchema },
      { name: CashEntry.name, schema: CashEntrySchema },
    ]),
  ],
  controllers: [FinanceManagerController],
  providers: [FinanceManagerService],
  exports: [FinanceManagerService],
})
export class FinanceManagerModule {}
