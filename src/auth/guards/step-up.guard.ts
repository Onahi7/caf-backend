import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { StepUpTokenService } from '../services/step-up-token.service.js';

export const REQUIRE_STEP_UP = 'requireStepUp';

/**
 * Protects sensitive endpoints (refunds, role changes, etc.). Requires the
 * caller to present a valid `X-Step-Up-Token` issued by `POST /webauthn/step-up`.
 *
 * Use via the decorator:
 *   @RequireStepUp()
 *   @Post('refund')
 *   async refund() { ... }
 *
 * The token is single-use and 5 minutes long.
 */
@Injectable()
export class StepUpGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: StepUpTokenService,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<boolean>(REQUIRE_STEP_UP, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required) return true;

    const req = ctx.switchToHttp().getRequest<Request>();
    const token =
      (req.headers['x-step-up-token'] as string | undefined) ??
      (req.headers['X-Step-Up-Token'] as string | undefined);
    if (!token) {
      throw new UnauthorizedException(
        'Step-up authentication required. Call POST /webauthn/step-up and retry.',
      );
    }
    try {
      const { userId } = this.tokens.consume(token);
      (req as Request & { stepUpUserId?: string }).stepUpUserId = userId;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired step-up token');
    }
  }
}
