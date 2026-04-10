import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as fc from 'fast-check';
import { AuthService } from './auth.service.js';
import { UsersService } from '../users/users.service.js';
import { RedisService } from '../redis/redis.service.js';
import { UserRole } from '../users/schemas/user.schema.js';

/**
 * Property-Based Tests for Authentication Token Lifecycle
 *
 * **Feature: pharmacy-pos-system, Property 61: Login token issuance**
 * **Feature: pharmacy-pos-system, Property 62: Token refresh**
 * **Feature: pharmacy-pos-system, Property 63: Logout token invalidation**
 *
 * **Validates: Requirements 15.1, 15.2, 15.3, 15.4**
 */
describe('Auth Token Lifecycle Property Tests', () => {
  let authService: AuthService;
  let usersService: UsersService;
  let jwtService: JwtService;
  let redisService: RedisService;

  // Mock user generator
  const userArb = fc.record({
    _id: fc
      .string({ minLength: 24, maxLength: 24 })
      .filter((s) => /^[0-9a-f]{24}$/.test(s)),
    username: fc.string({ minLength: 3, maxLength: 20 }),
    password: fc.constant('ValidPass123!'),
    email: fc.emailAddress(),
    firstName: fc.string({ minLength: 1, maxLength: 50 }),
    lastName: fc.string({ minLength: 1, maxLength: 50 }),
    role: fc.constantFrom(...Object.values(UserRole)),
    isActive: fc.constant(true),
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UsersService,
          useValue: {
            findByUsername: jest.fn(),
            findById: jest.fn(),
          },
        },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn(),
            verify: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config: Record<string, string> = {
                JWT_SECRET: 'test-secret',
                JWT_REFRESH_SECRET: 'test-refresh-secret',
                JWT_EXPIRATION: '15m',
                JWT_REFRESH_EXPIRATION: '7d',
              };
              return config[key];
            }),
          },
        },
        {
          provide: RedisService,
          useValue: {
            set: jest.fn(),
            get: jest.fn(),
            del: jest.fn(),
          },
        },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
    usersService = module.get<UsersService>(UsersService);
    jwtService = module.get<JwtService>(JwtService);
    redisService = module.get<RedisService>(RedisService);
  });

  describe('Property 61: Login token issuance', () => {
    it('should issue both access and refresh tokens for any valid login', async () => {
      await fc.assert(
        fc.asyncProperty(userArb, async (user) => {
          // Mock user lookup and password comparison
          const mockUser = {
            ...user,
            _id: { toString: () => user._id },
            branchId: undefined,
            comparePassword: jest.fn().mockResolvedValue(true),
          };

          jest
            .spyOn(usersService, 'findByUsername')
            .mockResolvedValue(mockUser as any);
          jest
            .spyOn(jwtService, 'sign')
            .mockReturnValueOnce(`access_token_${user._id}`)
            .mockReturnValueOnce(`refresh_token_${user._id}`);
          jest.spyOn(redisService, 'set').mockResolvedValue('OK' as any);

          const result = await authService.login({
            username: user.username,
            password: user.password,
          });

          // Property: Response should contain both accessToken and refreshToken
          expect(result).toHaveProperty('accessToken');
          expect(result).toHaveProperty('refreshToken');
          expect(result.accessToken).toBeTruthy();
          expect(result.refreshToken).toBeTruthy();
          expect(result.expiresIn).toBeGreaterThan(0);

          // Verify refresh token was stored in Redis
          expect(redisService.set).toHaveBeenCalledWith(
            `refresh_token:${user._id}`,
            expect.any(String),
            expect.any(Number),
          );
        }),
        { numRuns: 100 },
      );
    });

    it('should reject login for inactive users', async () => {
      await fc.assert(
        fc.asyncProperty(userArb, async (user) => {
          const inactiveUser = {
            ...user,
            isActive: false,
            _id: { toString: () => user._id },
            comparePassword: jest.fn().mockResolvedValue(true),
          };

          jest
            .spyOn(usersService, 'findByUsername')
            .mockResolvedValue(inactiveUser as any);

          await expect(
            authService.login({
              username: user.username,
              password: user.password,
            }),
          ).rejects.toThrow('User account is inactive');
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('Property 62: Token refresh', () => {
    it('should issue new access token for any valid refresh token', async () => {
      await fc.assert(
        fc.asyncProperty(userArb, async (user) => {
          const refreshToken = `refresh_token_${user._id}`;
          const mockUser = {
            ...user,
            _id: { toString: () => user._id },
            branchId: undefined,
          };

          // Mock JWT verification
          jest.spyOn(jwtService, 'verify').mockReturnValue({
            sub: user._id,
            username: user.username,
            role: user.role,
          });

          // Mock Redis lookup
          jest.spyOn(redisService, 'get').mockResolvedValue(refreshToken);

          // Mock user lookup
          jest
            .spyOn(usersService, 'findById')
            .mockResolvedValue(mockUser as any);

          // Mock new access token generation
          jest
            .spyOn(jwtService, 'sign')
            .mockReturnValue(`new_access_token_${user._id}`);

          const result = await authService.refresh(refreshToken);

          // Property: Should return new access token with same refresh token
          expect(result).toHaveProperty('accessToken');
          expect(result).toHaveProperty('refreshToken');
          expect(result.accessToken).toBeTruthy();
          expect(result.refreshToken).toBe(refreshToken);
          expect(result.expiresIn).toBeGreaterThan(0);
        }),
        { numRuns: 100 },
      );
    });

    it('should reject refresh if token not in Redis', async () => {
      await fc.assert(
        fc.asyncProperty(userArb, async (user) => {
          const refreshToken = `refresh_token_${user._id}`;

          jest.spyOn(jwtService, 'verify').mockReturnValue({
            sub: user._id,
            username: user.username,
            role: user.role,
          });

          // Token not found in Redis
          jest.spyOn(redisService, 'get').mockResolvedValue(null);

          await expect(authService.refresh(refreshToken)).rejects.toThrow(
            'Invalid refresh token',
          );
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('Property 63: Logout token invalidation', () => {
    it('should invalidate refresh token for any user logout', async () => {
      await fc.assert(
        fc.asyncProperty(userArb, async (user) => {
          jest.spyOn(redisService, 'del').mockResolvedValue(undefined);

          await authService.logout(user._id);

          // Property: Refresh token should be removed from Redis
          expect(redisService.del).toHaveBeenCalledWith(
            `refresh_token:${user._id}`,
          );
        }),
        { numRuns: 100 },
      );
    });

    it('should prevent token refresh after logout', async () => {
      await fc.assert(
        fc.asyncProperty(userArb, async (user) => {
          const refreshToken = `refresh_token_${user._id}`;

          // Simulate logout
          jest.spyOn(redisService, 'del').mockResolvedValue(undefined);
          await authService.logout(user._id);

          // Try to refresh after logout
          jest.spyOn(jwtService, 'verify').mockReturnValue({
            sub: user._id,
            username: user.username,
            role: user.role,
          });

          // Token should not be in Redis after logout
          jest.spyOn(redisService, 'get').mockResolvedValue(null);

          await expect(authService.refresh(refreshToken)).rejects.toThrow(
            'Invalid refresh token',
          );
        }),
        { numRuns: 100 },
      );
    });
  });
});
