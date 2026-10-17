import { EventEmitter } from 'node:events';
import type { Connection } from 'mongoose';

interface CacheEntry {
  key: string;
  value: string;
  expiresAt: Date | null;
}

/** Shared persistent cache for deployments without an available Redis service. */
export class MongoCacheStore extends EventEmitter {
  readonly opts = { dialect: 'mongodb' };
  namespace?: string;
  private readonly entries;

  constructor(connection: Connection) {
    super();
    if (!connection.db)
      throw new Error('MongoDB cache requires an open database connection');
    this.entries = connection.db.collection<CacheEntry>('application_cache');
  }

  async initialize(): Promise<void> {
    await this.entries.createIndex({ key: 1 }, { unique: true });
    await this.entries.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  }

  async get<T>(key: string): Promise<T | undefined> {
    const entry = await this.entries.findOne({
      key,
      $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
    });
    return entry?.value as T | undefined;
  }

  async set(key: string, value: string, ttl?: number): Promise<boolean> {
    const expiresAt = ttl === undefined ? null : new Date(Date.now() + ttl);
    await this.entries.updateOne(
      { key },
      { $set: { value, expiresAt } },
      { upsert: true },
    );
    return true;
  }

  async delete(key: string): Promise<boolean> {
    return (await this.entries.deleteOne({ key })).deletedCount > 0;
  }

  async clear(): Promise<void> {
    const prefix = this.namespace ? `${this.namespace}:` : '';
    await this.entries.deleteMany(
      prefix ? { key: { $gte: prefix, $lt: `${prefix}\uffff` } } : {},
    );
  }

  // The application owns the shared MongoDB connection and closes it itself.
  async disconnect(): Promise<void> {}
}
