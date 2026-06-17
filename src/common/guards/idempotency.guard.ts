import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { RedisService } from '../../redis/redis.service.js';

export const IDEMPOTENCY_KEY = 'idempotency';

/** 24-hour TTL for idempotency records */
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

export interface IdempotencyRecord {
  status: 'processing' | 'complete';
  responseBody?: unknown;
  responseStatus?: number;
}

/**
 * IdempotencyGuard - extracts `X-Idempotency-Key` header, checks Redis:
 *  - Not found -> allow request through (first attempt)
 *  - Found with status=processing -> 409 Conflict (concurrent duplicate)
 *  - Found with status=complete -> replay cached response immediately
 *
 * After the handler runs, ResponseInterceptor stores the result.
 * Apply with @UseGuards(IdempotencyGuard) on any mutating endpoint.
 */
@Injectable()
export class IdempotencyGuard implements CanActivate {
  private readonly logger = new Logger(IdempotencyGuard.name);

  constructor(private readonly redis: RedisService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();

    const key = req.headers['x-idempotency-key'] as string | undefined;
    if (!key) {
      throw new BadRequestException('X-Idempotency-Key header is required');
    }

    if (key.length < 8 || key.length > 128) {
      throw new BadRequestException(
        'X-Idempotency-Key must be between 8 and 128 characters',
      );
    }

    const redisKey = `idempotency:${key}`;
    const existing = await this.redis.get<IdempotencyRecord>(redisKey);

    if (existing) {
      if (existing.status === 'processing') {
        throw new ConflictException(
          'A request with this idempotency key is already being processed',
        );
      }

      // Replay the stored response
      this.logger.debug(`Replaying idempotent response for key: ${key}`);
      res
        .status(existing.responseStatus ?? 201)
        .json(existing.responseBody);
      return false; // short-circuit the handler
    }

    // Mark as processing so concurrent duplicates get 409
    await this.redis.set<IdempotencyRecord>(
      redisKey,
      { status: 'processing' },
      IDEMPOTENCY_TTL_MS,
    );

    // Attach key to request so the interceptor can find it
    (req as any)._idempotencyKey = redisKey;

    return true;
  }
}
