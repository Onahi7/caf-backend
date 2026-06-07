import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHmac, randomBytes } from 'crypto';

const STEP_UP_TTL_MS = 5 * 60_000;

interface StepUpEntry {
  userId: string;
  expiresAt: number;
}

const store = (() => {
  const map = new Map<string, StepUpEntry>();
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of map) {
      if (v.expiresAt < now) map.delete(k);
    }
  }, 60_000).unref?.();
  return map;
})();

/**
 * Holds 5-minute single-use step-up tokens. Tokens are signed (HMAC-SHA256
 * with a per-process secret) so they can be verified in isolation from the
 * store when we move to Redis. For now, this is in-process; for multi-pod
 * production deployments, replace the Map with Redis SETEX + GETDEL.
 */
@Injectable()
export class StepUpTokenService {
  private readonly secret: Buffer;

  constructor() {
    this.secret = randomBytes(32);
  }

  issue(userId: string): { token: string; expiresAt: number } {
    const expiresAt = Date.now() + STEP_UP_TTL_MS;
    const payload = Buffer.from(JSON.stringify({ userId, expiresAt })).toString('base64url');
    const sig = createHmac('sha256', this.secret).update(payload).digest('base64url');
    const token = `${payload}.${sig}`;
    store.set(token, { userId, expiresAt });
    return { token, expiresAt };
  }

  consume(token: string): { userId: string } {
    if (!token || !token.includes('.')) {
      throw new UnauthorizedException('Malformed step-up token');
    }
    const entry = store.get(token);
    if (!entry) {
      throw new UnauthorizedException('Invalid or expired step-up token');
    }
    if (entry.expiresAt < Date.now()) {
      store.delete(token);
      throw new UnauthorizedException('Step-up token expired');
    }
    store.delete(token); // single-use
    return { userId: entry.userId };
  }
}
