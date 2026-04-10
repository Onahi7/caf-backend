# Redis Module

This module provides Redis caching and session storage functionality for the pharmacy POS system.

## Features

- **Caching**: General-purpose caching with configurable TTL
- **Session Storage**: User session management with automatic expiration
- **Token Management**: Refresh token storage and invalidation
- **Inventory Caching**: Fast access to frequently queried inventory data
- **Connection Pooling**: Optimized Redis connection management
- **Automatic Reconnection**: Resilient connection handling with retry strategy

## Configuration

Redis connection is configured via environment variables:

```env
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
```

## Usage

### Basic Caching

```typescript
import { RedisService } from './redis';

@Injectable()
export class MyService {
  constructor(private redisService: RedisService) {}

  async cacheData() {
    // Set a value with default TTL (1 hour)
    await this.redisService.set('my-key', { data: 'value' });

    // Set a value with custom TTL (5 minutes)
    await this.redisService.set('my-key', { data: 'value' }, 5 * 60 * 1000);

    // Get a value
    const value = await this.redisService.get('my-key');

    // Delete a value
    await this.redisService.del('my-key');
  }
}
```

### Session Management

```typescript
// Store session data (default: 7 days TTL)
await this.redisService.setSession('user-123', {
  userId: '123',
  role: 'cashier',
  branchId: 'branch-1',
});

// Get session data
const session = await this.redisService.getSession('user-123');

// Delete session
await this.redisService.deleteSession('user-123');
```

### Token Management

```typescript
// Store refresh token (default: 7 days TTL)
await this.redisService.setRefreshToken('user-123', 'refresh-token-xyz');

// Get refresh token
const token = await this.redisService.getRefreshToken('user-123');

// Delete refresh token (logout)
await this.redisService.deleteRefreshToken('user-123');

// Invalidate all tokens for a user
await this.redisService.invalidateUserTokens('user-123');
```

### Inventory Caching

```typescript
// Cache inventory quantity (default: 5 minutes TTL)
await this.redisService.cacheInventory('branch-1', 'product-123', 50);

// Get cached inventory
const quantity = await this.redisService.getCachedInventory(
  'branch-1',
  'product-123',
);

// Invalidate inventory cache
await this.redisService.invalidateInventoryCache('branch-1', 'product-123');
```

## Connection Pooling

The Redis module is configured with connection pooling for optimal performance:

- **Max Retries**: 3 retries per request
- **Ready Check**: Enabled for connection verification
- **Offline Queue**: Enabled to queue commands during reconnection
- **Retry Strategy**: Exponential backoff with max 2-second delay

## Global Module

The Redis module is marked as `@Global()`, making it available throughout the application without needing to import it in every module.

## Error Handling

All Redis operations include error handling with logging. Failed operations are logged but don't crash the application, ensuring resilience.

## Testing

To test Redis connectivity:

1. Start Redis via Docker Compose:
   ```bash
   docker-compose up redis
   ```

2. The Redis service will be available at `localhost:6379`

3. Use the RedisService in your tests or create a test endpoint to verify connectivity.
