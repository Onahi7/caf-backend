import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { MongooseModule } from '@nestjs/mongoose';
import { Reconciliation, ReconciliationSchema } from './schema/reconciliation.schema.js';
import { Salary, SalarySchema } from './schema/salary.schema.js';
import { CashEntry, CashEntrySchema } from './schema/cash-entry.schema.js';
import { Loan, LoanSchema } from './schema/loan.schema.js';
import { EmployeeAdvance, EmployeeAdvanceSchema } from './schema/employee-advance.schema.js';
import { Sale, SaleSchema } from '../sales/schemas/sale.schema.js';
import { Shift, ShiftSchema } from '../shifts/schemas/shift.schema.js';
import { Expense, ExpenseSchema } from '../expenses/schemas/expense.schema.js';
import { FinanceTransaction, FinanceTransactionSchema } from '../finance/schemas/finance-transaction.schema.js';
import { MarketerSale, MarketerSaleSchema } from '../marketer/schemas/marketer-sale.schema.js';
import { MarketerProductAssignment, MarketerProductAssignmentSchema } from '../marketer/schemas/marketer-product-assignment.schema.js';
import { PurchaseOrder, PurchaseOrderSchema } from '../purchases/schemas/purchase-order.schema.js';
import { StockMovement, StockMovementSchema } from '../inventory/schemas/stock-movement.schema.js';
import { FinanceManagerService } from './finance-manager.service.js';
import { FinanceAggregationService } from './finance-aggregation.service.js';
import { MicroserviceClientService } from './microservice-client.service.js';
import { LoanService } from './loan.service.js';
import { EmployeeAdvanceService } from './employee-advance.service.js';
import { FinanceManagerController } from './finance-manager.controller.js';
import { LoansAdvancesController } from './loans-advances.controller.js';
import { WebSocketModule } from '../websocket/websocket.module.js';
import { AuditModule } from '../audit/audit.module.js';

@Module({
  imports: [
    HttpModule.register({ timeout: 15000, maxRedirects: 3 }),
    WebSocketModule,
    AuditModule,
    MongooseModule.forFeature([
      { name: Reconciliation.name, schema: ReconciliationSchema },
      { name: Salary.name, schema: SalarySchema },
      { name: CashEntry.name, schema: CashEntrySchema },
      { name: Loan.name, schema: LoanSchema },
      { name: EmployeeAdvance.name, schema: EmployeeAdvanceSchema },
      { name: Sale.name, schema: SaleSchema },
      { name: Shift.name, schema: ShiftSchema },
      { name: Expense.name, schema: ExpenseSchema },
      { name: FinanceTransaction.name, schema: FinanceTransactionSchema },
      { name: MarketerSale.name, schema: MarketerSaleSchema },
      { name: MarketerProductAssignment.name, schema: MarketerProductAssignmentSchema },
      { name: PurchaseOrder.name, schema: PurchaseOrderSchema },
      { name: StockMovement.name, schema: StockMovementSchema },
    ]),
  ],
  controllers: [FinanceManagerController, LoansAdvancesController],
  providers: [
    FinanceManagerService,
    FinanceAggregationService,
    MicroserviceClientService,
    LoanService,
    EmployeeAdvanceService,
  ],
  exports: [
    FinanceManagerService,
    FinanceAggregationService,
    MicroserviceClientService,
    LoanService,
    EmployeeAdvanceService,
  ],
})
export class FinanceManagerModule {}
