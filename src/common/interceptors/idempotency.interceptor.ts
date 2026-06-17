import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { throwError } from 'rxjs';
import type { Request, Response } from 'express';
import { RedisService } from '../../redis/redis.service.js';
import type { IdempotencyRecord } from '../guards/idempotency.guard.js';

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * IdempotencyInterceptor - after the handler emits its response, stores
 * the body + status in Redis under the key set by IdempotencyGuard,
 * transitioning the record from `processing` -> `complete`.
 *
 * Must be used together with @UseGuards(IdempotencyGuard).
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name);

  constructor(private readonly redis: RedisService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const redisKey: string | undefined = (req as any)._idempotencyKey;

    if (!redisKey) {
      return next.handle();
    }

    return next.handle().pipe(
      tap(async (responseBody) => {
        const record: IdempotencyRecord = {
          status: 'complete',
          responseBody,
          responseStatus: res.statusCode,
        };
        try {
          await this.redis.set<IdempotencyRecord>(
            redisKey,
            record,
            IDEMPOTENCY_TTL_MS,
          );
        } catch (err) {
          this.logger.error(
            `Failed to persist idempotency record for ${redisKey}`,
            err,
          );
        }
      }),
      catchError((err) => {
        void this.redis.del(redisKey).catch((deleteErr) => {
          this.logger.error(
            `Failed to clear idempotency record for ${redisKey}`,
            deleteErr,
          );
        });
        return throwError(() => err);
      }),
    );
  }
}
