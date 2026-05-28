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
          useFactory: (configService: ConfigService) => {
            const redisUrl =
              configService.get<string>('REDIS_URL') ||
              configService.get<string>('KV_URL');
            const parsedRedisUrl = redisUrl ? new URL(redisUrl) : null;
            const redisOptions = parsedRedisUrl
              ? {
                  host: parsedRedisUrl.hostname,
                  port: Number(parsedRedisUrl.port || 6379),
                  username: parsedRedisUrl.username
                    ? decodeURIComponent(parsedRedisUrl.username)
                    : undefined,
                  password: parsedRedisUrl.password
                    ? decodeURIComponent(parsedRedisUrl.password)
                    : undefined,
                  tls: parsedRedisUrl.protocol === 'rediss:' ? {} : undefined,
                }
              : {
                  host: configService.get<string>('REDIS_HOST', 'localhost'),
                  port: configService.get<number>('REDIS_PORT', 6379),
                  password: configService.get<string>('REDIS_PASSWORD'),
                  tls:
                    configService.get<string>('REDIS_TLS') === 'true'
                      ? {}
                      : undefined,
                };

            return {
              redis: {
                ...redisOptions,
                maxRetriesPerRequest: 1,
                enableReadyCheck: false,
                enableOfflineQueue: true,
                connectTimeout: 5000,
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
            };
          },
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
