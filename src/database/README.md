# Database Module

This module configures MongoDB connection with replica set support for ACID transactions.

## Features

- **Replica Set Configuration**: Enables ACID transactions across multiple operations
- **Connection Pooling**: Optimized connection management with min/max pool sizes
- **Automatic Retries**: Built-in retry logic for writes and reads
- **Read Preference**: Primary-preferred for consistency
- **Write Concern**: Majority write concern for durability

## Configuration

The database connection is configured via environment variables:

```env
MONGODB_URI=mongodb://localhost:27017,localhost:27018,localhost:27019/pharmacy-pos?replicaSet=rs0
```

### Connection Options

- `replicaSet`: Name of the replica set (rs0)
- `maxPoolSize`: Maximum number of connections in the pool (10)
- `minPoolSize`: Minimum number of connections in the pool (2)
- `serverSelectionTimeoutMS`: Timeout for server selection (5000ms)
- `socketTimeoutMS`: Socket timeout (45000ms)
- `retryWrites`: Enable automatic retry for write operations
- `retryReads`: Enable automatic retry for read operations
- `readPreference`: Primary-preferred for read operations
- `w`: Write concern set to 'majority'
- `journal`: Enable journaling for durability

## Local Development Setup

### Using Docker Compose

1. Start the MongoDB replica set and Redis:
```bash
docker-compose up -d
```

2. Wait for the replica set to initialize (about 15-20 seconds)

3. Verify the replica set status:
```bash
docker exec -it pharmacy-mongo1 mongosh --eval "rs.status()"
```

4. Start the NestJS application:
```bash
pnpm run start:dev
```

### Manual Setup (Without Docker)

If you prefer to run MongoDB locally without Docker:

1. Install MongoDB 6.0+
2. Configure a replica set manually
3. Update the `MONGODB_URI` in `.env` to point to your local replica set

## Transactions

The replica set configuration enables ACID transactions. Example usage:

```typescript
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

export class SomeService {
  constructor(@InjectConnection() private connection: Connection) {}

  async performTransaction() {
    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      // Perform multiple operations
      await this.model1.create([{ ... }], { session });
      await this.model2.updateOne({ ... }, { ... }, { session });

      // Commit the transaction
      await session.commitTransaction();
    } catch (error) {
      // Rollback on error
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }
}
```

## Troubleshooting

### Connection Refused

If you see connection errors, ensure:
1. Docker containers are running: `docker ps`
2. Replica set is initialized: Check logs with `docker logs pharmacy-mongo-init`
3. Ports are not in use: 27017, 27018, 27019, 6379

### Replica Set Not Ready

If transactions fail with "not master" errors:
1. Wait for replica set to stabilize (15-20 seconds after startup)
2. Check replica set status: `docker exec -it pharmacy-mongo1 mongosh --eval "rs.status()"`
3. Ensure at least one PRIMARY node exists

### Performance Issues

If you experience slow queries:
1. Check connection pool usage
2. Verify indexes are created (auto-created in development)
3. Monitor MongoDB logs: `docker logs pharmacy-mongo1`

## Production Considerations

For production deployments:

1. **Use MongoDB Atlas** or a managed MongoDB service with replica sets
2. **Disable autoIndex**: Set `autoIndex: false` in production
3. **Adjust pool sizes**: Based on your application load
4. **Enable monitoring**: Use MongoDB monitoring tools
5. **Backup strategy**: Implement automated backups
6. **Security**: Enable authentication and TLS/SSL
