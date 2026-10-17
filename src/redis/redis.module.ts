import { Module, Global, Logger } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { ConfigModule, ConfigService } from '@nestjs/config';
import KeyvRedis from '@keyv/redis';
import { createSessionCache } from './keyv-cache.js';
import { getConnectionToken } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import { MongoCacheStore } from './mongo-cache.store.js';
import { RedisService } from './redis.service.js';

@Global()
@Module({
  imports: [
    CacheModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService, getConnectionToken()],
      useFactory: async (configService: ConfigService, connection: Connection) => {
        const backend = configService.get<string>('CACHE_BACKEND', 'redis');
        if (!['redis', 'mongodb'].includes(backend)) throw new Error('CACHE_BACKEND must be redis or mongodb');
        if (backend === 'mongodb') {
          await connection.asPromise();
          const store = new MongoCacheStore(connection);
          await store.initialize();
          return { stores: [createSessionCache(store)], isGlobal: true };
        }
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

          const fallbackUrl = new URL(`${redisOptions.tls ? 'rediss' : 'redis'}://${redisOptions.host}:${redisOptions.port}`);
          if (redisOptions.password) fallbackUrl.password = redisOptions.password;
          const store = new KeyvRedis(redisUrl || fallbackUrl.toString(), { throwOnErrors: true, connectionTimeout: 5000 });
          await store.set('caf:cache-readiness', 'ready', 1000);

          logger.log('Redis cache connected successfully');
          return {
            stores: [createSessionCache(store)],
            isGlobal: true,
          };
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error';
          logger.error(`Redis connection failed: ${errorMessage}`);
          throw error;
        }
      },
    }),
  ],
  providers: [RedisService],
  exports: [CacheModule, RedisService],
})
export class RedisModule {}
