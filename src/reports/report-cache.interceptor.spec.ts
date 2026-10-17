import { Reflector } from '@nestjs/core';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { ExecutionContext } from '@nestjs/common';
import type { Cache } from 'cache-manager';
import { ReportCacheInterceptor } from './report-cache.interceptor.js';

describe('Report cache boundaries', () => {
  class Controller {
    report() {}
  }
  const cache = new ReportCacheInterceptor({} as Cache, new Reflector());
  const key = (userId: string, branchId: string) => {
    const context = {
      getClass: () => Controller,
      getHandler: () => Controller.prototype.report,
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'GET',
          url: '/api/reports/dashboard-stats',
          user: { userId, branchId, role: 'cashier' },
        }),
      }),
    };
    return (
      cache as unknown as { trackBy(ctx: ExecutionContext): string | undefined }
    ).trackBy(context as unknown as ExecutionContext);
  };
  afterEach(() =>
    Reflect.deleteMetadata(ROUTE_ARGS_METADATA, Controller, 'report'),
  );
  it('isolates users and current assignments for the same URL', () => {
    expect(key('alice', 'one')).not.toEqual(key('bob', 'one'));
    expect(key('alice', 'one')).not.toEqual(key('alice', 'two'));
  });
  it('skips handlers with an Express response parameter', () => {
    Reflect.defineMetadata(
      ROUTE_ARGS_METADATA,
      { '1:2': {} },
      Controller,
      'report',
    );
    expect(key('alice', 'one')).toBeUndefined();
  });
});
