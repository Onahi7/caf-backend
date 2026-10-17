import { MongoCacheStore } from './mongo-cache.store.js';
import { createSessionCache } from './keyv-cache.js';
import type { Connection } from 'mongoose';

describe('Mongo cache persistence', () => {
  const rows = new Map<
    string,
    { key: string; value: string; expiresAt: Date | null }
  >();
  const entries = {
    createIndex: jest.fn(),
    updateOne: jest.fn(async (filter, update) => {
      rows.set(filter.key, { key: filter.key, ...update.$set });
    }),
    findOne: jest.fn(async (filter) => {
      const row = rows.get(filter.key);
      return row && (row.expiresAt === null || row.expiresAt > new Date())
        ? row
        : null;
    }),
    deleteOne: jest.fn(async (filter) => ({
      deletedCount: rows.delete(filter.key) ? 1 : 0,
    })),
    deleteMany: jest.fn(),
  };
  const connection = {
    db: { collection: () => entries },
  } as unknown as Connection;
  beforeEach(() => {
    rows.clear();
    jest.clearAllMocks();
  });
  it('shares session state between cache instances and persists revocation', async () => {
    const first = createSessionCache(new MongoCacheStore(connection));
    const second = createSessionCache(new MongoCacheStore(connection));
    await first.set('refresh_token:user', 'token', 30000);
    expect(await second.get('refresh_token:user')).toBe('token');
    await second.delete('refresh_token:user');
    expect(await first.get('refresh_token:user')).toBeUndefined();
  });
  it('rejects expired values before MongoDB TTL cleanup', async () => {
    const store = new MongoCacheStore(connection);
    await store.set('expired', 'value', -1);
    expect(await store.get('expired')).toBeUndefined();
  });
  it('propagates write failures instead of silently losing sessions', async () => {
    const cache = createSessionCache(new MongoCacheStore(connection));
    entries.updateOne.mockRejectedValueOnce(
      new Error('database unavailable') as never,
    );
    await expect(cache.set('refresh_token:user', 'token')).rejects.toThrow(
      'database unavailable',
    );
  });
  it('creates expiry and uniqueness indexes explicitly in production too', async () => {
    await new MongoCacheStore(connection).initialize();
    expect(entries.createIndex).toHaveBeenCalledWith(
      { key: 1 },
      { unique: true },
    );
    expect(entries.createIndex).toHaveBeenCalledWith(
      { expiresAt: 1 },
      { expireAfterSeconds: 0 },
    );
  });
});
