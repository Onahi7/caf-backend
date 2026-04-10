import { Module, DynamicModule, Logger } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ExpiryAlertProcessor } from './processors/expiry-alert.processor.js';
import { LowStockAlertProcessor } from './processors/low-stock-alert.processor.js';
import { JobsService } from './jobs.service.js';
import { JobsController } from './jobs.controller.js';
import { BatchesModule } from '../batches/batches.module.js';
import { BranchesModule } from '../branches/branches.module.js';
import { InventoryModule } from '../inventory/inventory.module.js';
import { WebSocketModule } from '../websocket/websocket.module.js';

/**
 * Jobs Module
 * Configures Bull queue with Redis for background job processing
 * Requirements: 12.5, 8.4
 */
@Module({})
export class JobsModule {
  static forRoot(): DynamicModule {
    const logger = new Logger('JobsModule');

    // Check if Redis is enabled via environment variable
    const redisEnabled = process.env.ENABLE_REDIS !== 'false';

    const imports: any[] = [
      BatchesModule,
      BranchesModule,
      InventoryModule,
      WebSocketModule,
    ];

    if (redisEnabled) {
      logger.log('Bull Queue enabled with Redis backend');
      imports.push(
        BullModule.forRootAsync({
          imports: [ConfigModule],
          useFactory: (configService: ConfigService) => ({
            redis: {
              host: configService.get<string>('REDIS_HOST', 'localhost'),
              port: configService.get<number>('REDIS_PORT', 6379),
              password: configService.get<string>('REDIS_PASSWORD'),
              maxRetriesPerRequest: 1,
              enableReadyCheck: false,
              enableOfflineQueue: false,
              connectTimeout: 5000,
              lazyConnect: true,
            },
            defaultJobOptions: {
              removeOnComplete: 100,
              removeOnFail: 50,
              attempts: 3,
              backoff: {
                type: 'exponential',
                delay: 1000,
              },
            },
          }),
          inject: [ConfigService],
        }),
        BullModule.registerQueue(
          { name: 'expiry-alerts' },
          { name: 'low-stock-alerts' },
        ),
      );
    } else {
      logger.warn('Bull Queue disabled. Background jobs will not run.');
    }

    return {
      module: JobsModule,
      imports,
      controllers: [JobsController],
      providers: redisEnabled
        ? [JobsService, ExpiryAlertProcessor, LowStockAlertProcessor]
        : [JobsService],
      exports: [JobsService],
    };
  }
}
