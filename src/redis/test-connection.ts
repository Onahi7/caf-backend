import Redis from 'ioredis';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Load environment variables
dotenv.config({ path: resolve(__dirname, '../../.env') });

async function testRedisConnection() {
  console.log('Testing Redis connection...\n');

  const redis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || undefined,
    retryStrategy: (times: number) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
  });

  try {
    // Test basic connectivity
    console.log('1. Testing PING command...');
    const pong = await redis.ping();
    console.log(`   OK PING response: ${pong}\n`);

    // Test SET operation
    console.log('2. Testing SET operation...');
    await redis.set('test:connection', 'Hello Redis!', 'EX', 60);
    console.log('   OK SET successful\n');

    // Test GET operation
    console.log('3. Testing GET operation...');
    const value = await redis.get('test:connection');
    console.log(`   OK GET successful: ${value}\n`);

    // Test DEL operation
    console.log('4. Testing DEL operation...');
    await redis.del('test:connection');
    console.log('   OK DEL successful\n');

    // Test session storage pattern
    console.log('5. Testing session storage pattern...');
    const sessionData = {
      userId: 'test-user-123',
      role: 'cashier',
      branchId: 'branch-1',
      timestamp: new Date().toISOString(),
    };
    await redis.set(
      'session:test-user-123',
      JSON.stringify(sessionData),
      'EX',
      3600,
    );
    const retrievedSession = await redis.get('session:test-user-123');
    console.log('   OK Session stored and retrieved successfully');
    console.log(`   Session data: ${retrievedSession}\n`);

    // Clean up
    await redis.del('session:test-user-123');

    // Get Redis info
    console.log('6. Redis Server Info:');
    const info = await redis.info('server');
    const version = info.match(/redis_version:([^\r\n]+)/)?.[1];
    const mode = info.match(/redis_mode:([^\r\n]+)/)?.[1];
    console.log(`   Redis Version: ${version}`);
    console.log(`   Redis Mode: ${mode}\n`);

    console.log('OK All Redis connection tests passed!\n');
    console.log('Redis Configuration:');
    console.log(`   Host: ${process.env.REDIS_HOST || 'localhost'}`);
    console.log(`   Port: ${process.env.REDIS_PORT || '6379'}`);
    console.log(
      `   Password: ${process.env.REDIS_PASSWORD ? '***' : '(none)'}\n`,
    );
  } catch (error) {
    console.error('ERROR Redis connection test failed:', error);
    process.exit(1);
  } finally {
    await redis.quit();
    console.log('Connection closed.');
  }
}

// Run the test
testRedisConnection();
