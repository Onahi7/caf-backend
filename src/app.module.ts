import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { DatabaseModule } from './database/database.module.js';
import { RedisModule } from './redis/redis.module.js';
import { UsersModule } from './users/users.module.js';
import { AuthModule } from './auth/auth.module.js';
import { BranchesModule } from './branches/branches.module.js';
import { ProductsModule } from './products/products.module.js';
import { BatchesModule } from './batches/batches.module.js';
import { InventoryModule } from './inventory/inventory.module.js';
import { TransfersModule } from './transfers/transfers.module.js';
import { ShiftsModule } from './shifts/shifts.module.js';
import { SalesModule } from './sales/sales.module.js';
import { SuppliersModule } from './suppliers/suppliers.module.js';
import { PurchasesModule } from './purchases/purchases.module.js';
import { ReportsModule } from './reports/reports.module.js';
import { WebSocketModule } from './websocket/websocket.module.js';
import { CustomersModule } from './customers/customers.module.js';
import { PromotionsModule } from './promotions/promotions.module.js';
import { JobsModule } from './jobs/jobs.module.js';
import { EmailModule } from './email/email.module.js';
import { ExpensesModule } from './expenses/expenses.module.js';
import { AuditModule } from './audit/audit.module.js';
import { PrintersModule } from './printers/printers.module.js';
import { SettingsModule } from './settings/settings.module.js';
import { FinanceModule } from './finance/finance.module.js';
import { MarketerModule } from './marketer/marketer.module.js';
import { CycleCountsModule } from './cycle-counts/cycle-count.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60000, // 1 minute window
        limit: 100,  // 100 requests per minute (general)
      },
    ]),
    ScheduleModule.forRoot(),
    DatabaseModule,
    RedisModule,
    UsersModule,
    AuthModule,
    BranchesModule,
    ProductsModule,
    BatchesModule,
    InventoryModule,
    TransfersModule,
    ShiftsModule,
    SalesModule,
    SuppliersModule,
    PurchasesModule,
    ReportsModule,
    WebSocketModule,
    CustomersModule,
    PromotionsModule,
    JobsModule.forRoot(),
    EmailModule,
    ExpensesModule,
    AuditModule,
    PrintersModule,
    SettingsModule,
    FinanceModule,
    MarketerModule,
    CycleCountsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
