import { AuthService } from './auth.service.js';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service.js';
import { RedisService } from '../redis/redis.service.js';
import { AuditService } from '../audit/audit.service.js';

describe('Refresh session revocation', () => {
  const user = {
    _id: '012345678901234567890123',
    username: 'test',
    role: 'super_admin',
    isActive: true,
  };
  let state: string | undefined;
  let service: AuthService;
  let users: { findById: jest.Mock };
  let cache: { get: jest.Mock; set: jest.Mock; del: jest.Mock };
  beforeEach(() => {
    state = 'refresh';
    users = { findById: jest.fn().mockResolvedValue(user) };
    cache = {
      get: jest.fn(async () => state),
      set: jest.fn(),
      del: jest.fn(async () => {
        state = undefined;
      }),
    };
    service = new AuthService(
      users as unknown as UsersService,
      {
        verify: () => ({ sub: user._id }),
        sign: () => 'access',
      } as unknown as JwtService,
      {
        get: (key: string) =>
          key.includes('SECRET') ? 'test-secret' : undefined,
      } as ConfigService,
      cache as unknown as RedisService,
      { logLogout: jest.fn() } as unknown as AuditService,
    );
  });
  it('refreshes a matching live session without recreating cache state', async () => {
    await expect(service.refresh('refresh')).resolves.toMatchObject({
      accessToken: 'access',
      refreshToken: 'refresh',
    });
    expect(cache.set).not.toHaveBeenCalled();
  });
  it.each([undefined, 'different'])(
    'rejects missing or superseded session %s',
    async (value) => {
      state = value;
      await expect(service.refresh('refresh')).rejects.toMatchObject({
        status: 401,
      });
    },
  );
  it('rejects refresh after logout', async () => {
    await service.logout(user._id, user.username);
    await expect(service.refresh('refresh')).rejects.toMatchObject({
      status: 401,
    });
  });
  it('does not resurrect a session if logout overlaps user lookup', async () => {
    users.findById.mockImplementation(async () => {
      await service.logout(user._id, user.username);
      return user;
    });
    await service.refresh('refresh');
    expect(state).toBeUndefined();
    await expect(service.refresh('refresh')).rejects.toMatchObject({
      status: 401,
    });
  });
  it('fails closed on cache lookup failure', async () => {
    cache.get.mockRejectedValue(new Error('offline'));
    await expect(service.refresh('refresh')).rejects.toMatchObject({
      status: 401,
    });
  });
});
