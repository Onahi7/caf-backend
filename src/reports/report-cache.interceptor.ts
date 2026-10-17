import { ExecutionContext, Injectable } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { CacheInterceptor } from '@nestjs/cache-manager';

@Injectable()
export class ReportCacheInterceptor extends CacheInterceptor {
  protected trackBy(context: ExecutionContext): string | undefined {
    // Express responses and binary exports are sent directly and cannot be cached.
    const args =
      Reflect.getMetadata(
        ROUTE_ARGS_METADATA,
        context.getClass(),
        context.getHandler().name,
      ) || {};
    if (Object.keys(args).some((key) => key.startsWith('1:'))) return undefined;
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (request.method !== 'GET' || !user?.userId) return undefined;
    return `report:${user.userId}:${user.role}:${user.branchId || ''}:${request.originalUrl || request.url}`;
  }
}
