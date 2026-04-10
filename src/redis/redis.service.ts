import { Injectable, Inject, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';

/**
 * RedisService provides a wrapper around the cache manager
 * with additional utility methods for session storage and caching
 */
@Injectable()
export class RedisService {
  private readonly logger = new Logger(RedisService.name);

  constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {}

  /**
   * Get a value from cache
   * @param key Cache key
   * @returns Cached value or undefined
   */
  async get<T>(key: string): Promise<T | undefined> {
    try {
      return await this.cacheManager.get<T>(key);
    } catch (error) {
      this.logger.error(`Error getting key ${key} from cache:`, error);
      return undefined;
    }
  }

  /**
   * Set a value in cache
   * @param key Cache key
   * @param value Value to cache
   * @param ttl Time to live in milliseconds (optional)
   */
  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    try {
      await this.cacheManager.set(key, value, ttl);
    } catch (error) {
      this.logger.error(`Error setting key ${key} in cache:`, error);
      throw error;
    }
  }

  /**
   * Delete a value from cache
   * @param key Cache key
   */
  async del(key: string): Promise<void> {
    try {
      await this.cacheManager.del(key);
    } catch (error) {
      this.logger.error(`Error deleting key ${key} from cache:`, error);
      throw error;
    }
  }

  /**
   * Delete multiple keys from cache
   * @param keys Array of cache keys
   */
  async delMany(keys: string[]): Promise<void> {
    try {
      await Promise.all(keys.map((key) => this.cacheManager.del(key)));
    } catch (error) {
      this.logger.error(`Error deleting multiple keys from cache:`, error);
      throw error;
    }
  }

  /**
   * Clear all cache entries
   * Note: This method may not be available in all cache-manager versions
   */
  async reset(): Promise<void> {
    try {
      // Check if reset method exists
      if (typeof (this.cacheManager as any).reset === 'function') {
        await (this.cacheManager as any).reset();
      } else {
        this.logger.warn('Reset method not available on cache manager');
      }
    } catch (error) {
      this.logger.error('Error resetting cache:', error);
      throw error;
    }
  }

  /**
   * Store session data
   * @param sessionId Session identifier
   * @param data Session data
   * @param ttl Time to live in milliseconds (default: 7 days)
   */
  async setSession<T>(
    sessionId: string,
    data: T,
    ttl: number = 7 * 24 * 60 * 60 * 1000,
  ): Promise<void> {
    const key = `session:${sessionId}`;
    await this.set(key, data, ttl);
  }

  /**
   * Get session data
   * @param sessionId Session identifier
   * @returns Session data or undefined
   */
  async getSession<T>(sessionId: string): Promise<T | undefined> {
    const key = `session:${sessionId}`;
    return await this.get<T>(key);
  }

  /**
   * Delete session data
   * @param sessionId Session identifier
   */
  async deleteSession(sessionId: string): Promise<void> {
    const key = `session:${sessionId}`;
    await this.del(key);
  }

  /**
   * Store refresh token
   * @param userId User identifier
   * @param token Refresh token
   * @param ttl Time to live in milliseconds (default: 7 days)
   */
  async setRefreshToken(
    userId: string,
    token: string,
    ttl: number = 7 * 24 * 60 * 60 * 1000,
  ): Promise<void> {
    const key = `refresh_token:${userId}`;
    await this.set(key, token, ttl);
  }

  /**
   * Get refresh token
   * @param userId User identifier
   * @returns Refresh token or undefined
   */
  async getRefreshToken(userId: string): Promise<string | undefined> {
    const key = `refresh_token:${userId}`;
    return await this.get<string>(key);
  }

  /**
   * Delete refresh token (logout)
   * @param userId User identifier
   */
  async deleteRefreshToken(userId: string): Promise<void> {
    const key = `refresh_token:${userId}`;
    await this.del(key);
  }

  /**
   * Invalidate all tokens for a user
   * @param userId User identifier
   */
  async invalidateUserTokens(userId: string): Promise<void> {
    await this.delMany([
      `refresh_token:${userId}`,
      `session:${userId}`,
      `access_token:${userId}`,
    ]);
  }

  /**
   * Cache inventory data
   * @param branchId Branch identifier
   * @param productId Product identifier
   * @param quantity Stock quantity
   * @param ttl Time to live in milliseconds (default: 5 minutes)
   */
  async cacheInventory(
    branchId: string,
    productId: string,
    quantity: number,
    ttl: number = 5 * 60 * 1000,
  ): Promise<void> {
    const key = `inventory:${branchId}:${productId}`;
    await this.set(key, quantity, ttl);
  }

  /**
   * Get cached inventory data
   * @param branchId Branch identifier
   * @param productId Product identifier
   * @returns Cached quantity or undefined
   */
  async getCachedInventory(
    branchId: string,
    productId: string,
  ): Promise<number | undefined> {
    const key = `inventory:${branchId}:${productId}`;
    return await this.get<number>(key);
  }

  /**
   * Invalidate inventory cache for a product at a branch
   * @param branchId Branch identifier
   * @param productId Product identifier
   */
  async invalidateInventoryCache(
    branchId: string,
    productId: string,
  ): Promise<void> {
    const key = `inventory:${branchId}:${productId}`;
    await this.del(key);
  }
}
