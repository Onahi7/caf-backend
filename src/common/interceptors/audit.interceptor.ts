import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError, throwError } from 'rxjs';
import type { Request } from 'express';
import { Reflector } from '@nestjs/core';
import { AuditService } from '../../audit/audit.service.js';
import { AuditAction } from '../../audit/schemas/audit-log.schema.js';
import { AUDIT_METADATA_KEY, AuditOptions } from '../decorators/audit.decorator.js';

interface JwtPayloadLike {
  userId: string;
  username?: string;
  role?: string;
  branchId?: string;
}

/**
 * AuditInterceptor - fires after a handler resolves to log an audit entry
 * describing the action. Resolves the resourceId and payload dynamically
 * from the request/response so each route can declare exactly what to log.
 *
 * Decoration:
 *   @Audit({ action: AuditAction.CREATE, resource: AuditResource.SALARY,
 *            resourceIdParam: 'id', getNewData: (req, res) => res })
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly auditService: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const options = this.reflector.get<AuditOptions>(
      AUDIT_METADATA_KEY,
      context.getHandler(),
    );
    if (!options) return next.handle();

    const req = context.switchToHttp().getRequest<Request & { user?: JwtPayloadLike }>();
    const user = req.user;
    if (!user) {
      this.logger.warn('Audit interceptor fired without authenticated user; skipping');
      return next.handle();
    }

    return next.handle().pipe(
      tap((response) => {
        void this.record(options, req, user, response, undefined).catch((err) =>
          this.logger.error(`Audit log failed: ${err instanceof Error ? err.message : 'unknown'}`),
        );
      }),
      catchError((err) => {
        if (options.action === AuditAction.CREATE || options.action === AuditAction.UPDATE) {
          const status = err?.getStatus?.() ?? 500;
          if (status >= 400 && status < 500) {
            void this.record(options, req, user, undefined, err).catch((auditErr) =>
              this.logger.error(`Audit log failed: ${auditErr instanceof Error ? auditErr.message : 'unknown'}`),
            );
          }
        }
        return throwError(() => err);
      }),
    );
  }

  private async record(
    options: AuditOptions,
    req: Request & { user?: JwtPayloadLike },
    user: JwtPayloadLike,
    response: unknown,
    error: unknown,
  ): Promise<void> {
    const params = (req as any).params as Record<string, string> | undefined;
    const resourceId =
      (options.resourceIdParam && params ? params[options.resourceIdParam] : undefined) ??
      (options.getResourceId ? options.getResourceId(req) : undefined) ??
      (this.extractResourceIdFromResponse(response) ?? user.userId);

    const branchId =
      options.getBranchId?.(req, response) ??
      user.branchId ??
      (this.extractBranchIdFromResponse(response)) ??
      undefined;

    const newData = options.getNewData?.(req, response) ?? this.safeNewData(response);
    const previousData = options.getPreviousData?.(req);
    const metadata = options.getMetadata?.(req, response);

    const username = user.username ?? `user:${user.userId}`;

    await this.auditService.log({
      userId: user.userId,
      username,
      action: options.action,
      resource: options.resource,
      resourceId: resourceId || user.userId,
      branchId,
      description: options.description ?? this.buildDescription(options, resourceId, error),
      previousData,
      newData,
      metadata: {
        ...(metadata ?? {}),
        ...(error ? { error: (error as any)?.message ?? String(error) } : {}),
      },
    });
  }

  private extractResourceIdFromResponse(response: unknown): string | undefined {
    if (response && typeof response === 'object') {
      const r = response as any;
      if (r.data && typeof r.data === 'object' && r.data._id) return String(r.data._id);
      if (r._id) return String(r._id);
      if (r.id) return String(r.id);
    }
    return undefined;
  }

  private extractBranchIdFromResponse(response: unknown): string | undefined {
    if (response && typeof response === 'object') {
      const r = response as any;
      if (r.data && typeof r.data === 'object' && r.data.branchId) return String(r.data.branchId);
      if (r.branchId) return String(r.branchId);
    }
    return undefined;
  }

  private safeNewData(response: unknown): Record<string, unknown> | undefined {
    if (!response) return undefined;
    if (typeof response !== 'object') return { value: response };
    const r = response as any;
    if (r.success === true && r.data) {
      return { _id: r.data._id, ...this.flattenKeys(r.data) };
    }
    return this.flattenKeys(response);
  }

  private flattenKeys(obj: any, depth = 1): Record<string, unknown> {
    if (!obj || typeof obj !== 'object' || depth < 0) return {};
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(obj)) {
      const v = obj[k];
      if (v instanceof Date) {
        out[k] = v.toISOString();
      } else if (v && typeof v === 'object' && !(v as any)._bsontype) {
        if (Array.isArray(v)) {
          out[k] = `[${v.length} items]`;
        } else if (k === 'passwordHash' || k === 'token' || k === 'refreshToken') {
          out[k] = '[redacted]';
        } else {
          out[k] = this.flattenKeys(v, depth - 1);
        }
      } else {
        out[k] = v;
      }
    }
    return out;
  }

  private buildDescription(
    options: AuditOptions,
    resourceId: string | undefined,
    error: unknown,
  ): string {
    const base = options.description ?? `${options.action} ${options.resource}`;
    if (error) return `${base} (failed)`;
    return resourceId ? `${base} ${resourceId}` : base;
  }
}
