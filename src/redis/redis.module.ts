import { Module, Global, Logger } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { redisStore } from 'cache-manager-ioredis-yet';
import { RedisService } from './redis.service.js';

@Global()
@Module({
  imports: [
    CacheModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => {
        const redisEnabled =
          configService.get<string>('ENABLE_REDIS', 'true') === 'true';
        const logger = new Logger('RedisModule');

        if (!redisEnabled) {
          logger.warn('Redis is disabled. Using in-memory cache instead.');
          return {
            isGlobal: true,
          };
        }

        try {
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

          const store = await redisStore({
            ...redisOptions,
            ttl: 60 * 60 * 1000, // 1 hour default TTL in milliseconds
            // Connection pool settings
            maxRetriesPerRequest: 1,
            enableReadyCheck: true,
            enableOfflineQueue: false,
            connectTimeout: 5000,
            // Reconnection strategy
            retryStrategy: (times: number) => {
              if (times > 3) {
                logger.error(
                  'Redis connection failed after 3 retries. Falling back to in-memory cache.',
                );
                return null; // Stop retrying
              }
              const delay = Math.min(times * 50, 2000);
              return delay;
            },
          });

          logger.log('Redis cache connected successfully');
          return {
            store,
            isGlobal: true,
          };
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error';
          logger.error(
            `Redis connection failed: ${errorMessage}. Using in-memory cache instead.`,
          );
          return {
            isGlobal: true,
          };
        }
      },
    }),
  ],
  providers: [RedisService],
  exports: [CacheModule, RedisService],
})
export class RedisModule {}
