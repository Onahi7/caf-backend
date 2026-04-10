import { Test, TestingModule } from '@nestjs/testing';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { RedisService } from './redis.service.js';

describe('RedisService', () => {
  let service: RedisService;
  let mockCacheManager: any;

  beforeEach(async () => {
    mockCacheManager = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisService,
        {
          provide: CACHE_MANAGER,
          useValue: mockCacheManager,
        },
      ],
    }).compile();

    service = module.get<RedisService>(RedisService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('get', () => {
    it('should get a value from cache', async () => {
      const key = 'test-key';
      const value = { data: 'test-value' };
      mockCacheManager.get.mockResolvedValue(value);

      const result = await service.get(key);

      expect(result).toEqual(value);
      expect(mockCacheManager.get).toHaveBeenCalledWith(key);
    });

    it('should return undefined on error', async () => {
      const key = 'test-key';
      mockCacheManager.get.mockRejectedValue(new Error('Cache error'));

      const result = await service.get(key);

      expect(result).toBeUndefined();
    });
  });

  describe('set', () => {
    it('should set a value in cache', async () => {
      const key = 'test-key';
      const value = { data: 'test-value' };
      mockCacheManager.set.mockResolvedValue(undefined);

      await service.set(key, value);

      expect(mockCacheManager.set).toHaveBeenCalledWith(key, value, undefined);
    });

    it('should set a value with TTL', async () => {
      const key = 'test-key';
      const value = { data: 'test-value' };
      const ttl = 5000;
      mockCacheManager.set.mockResolvedValue(undefined);

      await service.set(key, value, ttl);

      expect(mockCacheManager.set).toHaveBeenCalledWith(key, value, ttl);
    });
  });

  describe('del', () => {
    it('should delete a value from cache', async () => {
      const key = 'test-key';
      mockCacheManager.del.mockResolvedValue(undefined);

      await service.del(key);

      expect(mockCacheManager.del).toHaveBeenCalledWith(key);
    });
  });

  describe('session management', () => {
    it('should set session data', async () => {
      const sessionId = 'user-123';
      const data = { userId: '123', role: 'cashier' };
      mockCacheManager.set.mockResolvedValue(undefined);

      await service.setSession(sessionId, data);

      expect(mockCacheManager.set).toHaveBeenCalledWith(
        `session:${sessionId}`,
        data,
        7 * 24 * 60 * 60 * 1000,
      );
    });

    it('should get session data', async () => {
      const sessionId = 'user-123';
      const data = { userId: '123', role: 'cashier' };
      mockCacheManager.get.mockResolvedValue(data);

      const result = await service.getSession(sessionId);

      expect(result).toEqual(data);
      expect(mockCacheManager.get).toHaveBeenCalledWith(`session:${sessionId}`);
    });

    it('should delete session data', async () => {
      const sessionId = 'user-123';
      mockCacheManager.del.mockResolvedValue(undefined);

      await service.deleteSession(sessionId);

      expect(mockCacheManager.del).toHaveBeenCalledWith(`session:${sessionId}`);
    });
  });

  describe('token management', () => {
    it('should set refresh token', async () => {
      const userId = 'user-123';
      const token = 'refresh-token-xyz';
      mockCacheManager.set.mockResolvedValue(undefined);

      await service.setRefreshToken(userId, token);

      expect(mockCacheManager.set).toHaveBeenCalledWith(
        `refresh_token:${userId}`,
        token,
        7 * 24 * 60 * 60 * 1000,
      );
    });

    it('should get refresh token', async () => {
      const userId = 'user-123';
      const token = 'refresh-token-xyz';
      mockCacheManager.get.mockResolvedValue(token);

      const result = await service.getRefreshToken(userId);

      expect(result).toEqual(token);
      expect(mockCacheManager.get).toHaveBeenCalledWith(
        `refresh_token:${userId}`,
      );
    });

    it('should delete refresh token', async () => {
      const userId = 'user-123';
      mockCacheManager.del.mockResolvedValue(undefined);

      await service.deleteRefreshToken(userId);

      expect(mockCacheManager.del).toHaveBeenCalledWith(
        `refresh_token:${userId}`,
      );
    });
  });

  describe('inventory caching', () => {
    it('should cache inventory data', async () => {
      const branchId = 'branch-1';
      const productId = 'product-123';
      const quantity = 50;
      mockCacheManager.set.mockResolvedValue(undefined);

      await service.cacheInventory(branchId, productId, quantity);

      expect(mockCacheManager.set).toHaveBeenCalledWith(
        `inventory:${branchId}:${productId}`,
        quantity,
        5 * 60 * 1000,
      );
    });

    it('should get cached inventory data', async () => {
      const branchId = 'branch-1';
      const productId = 'product-123';
      const quantity = 50;
      mockCacheManager.get.mockResolvedValue(quantity);

      const result = await service.getCachedInventory(branchId, productId);

      expect(result).toEqual(quantity);
      expect(mockCacheManager.get).toHaveBeenCalledWith(
        `inventory:${branchId}:${productId}`,
      );
    });

    it('should invalidate inventory cache', async () => {
      const branchId = 'branch-1';
      const productId = 'product-123';
      mockCacheManager.del.mockResolvedValue(undefined);

      await service.invalidateInventoryCache(branchId, productId);

      expect(mockCacheManager.del).toHaveBeenCalledWith(
        `inventory:${branchId}:${productId}`,
      );
    });
  });
});
