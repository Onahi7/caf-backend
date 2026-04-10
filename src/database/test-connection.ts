import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { Connection } from 'mongoose';
import { getConnectionToken } from '@nestjs/mongoose';

/**
 * Test script to verify MongoDB replica set connection and transaction support
 *
 * Usage: ts-node -r tsconfig-paths/register src/database/test-connection.ts
 */
async function testConnection() {
  console.log('🔌 Testing MongoDB connection...\n');

  try {
    // Create NestJS application
    const app = await NestFactory.createApplicationContext(AppModule);

    // Get MongoDB connection
    const connection = app.get<Connection>(getConnectionToken());

    // Test 1: Basic connection
    console.log('✅ Test 1: Basic Connection');
    console.log(`   Connected to: ${connection.host}`);
    console.log(`   Database: ${connection.name}`);
    console.log(
      `   Ready state: ${connection.readyState === 1 ? 'Connected' : 'Not Connected'}\n`,
    );

    // Test 2: Replica set configuration
    console.log('✅ Test 2: Replica Set Configuration');
    const admin = connection.db!.admin();
    const replSetStatus = await admin.command({ replSetGetStatus: 1 });
    console.log(`   Replica Set: ${replSetStatus.set}`);
    console.log(`   Members: ${replSetStatus.members.length}`);
    replSetStatus.members.forEach((member: any) => {
      console.log(
        `   - ${member.name}: ${member.stateStr} (health: ${member.health})`,
      );
    });
    console.log();

    // Test 3: Transaction support
    console.log('✅ Test 3: Transaction Support');
    const session = await connection.startSession();
    console.log('   Session created successfully');

    session.startTransaction();
    console.log('   Transaction started');

    await session.commitTransaction();
    console.log('   Transaction committed');

    session.endSession();
    console.log('   Session ended\n');

    // Test 4: Write concern
    console.log('✅ Test 4: Write Concern');
    const testCollection = connection.collection('_connection_test');
    const result = await testCollection.insertOne(
      { test: true, timestamp: new Date() },
      { writeConcern: { w: 'majority', j: true } },
    );
    console.log(`   Document inserted with majority write concern`);
    console.log(`   Acknowledged: ${result.acknowledged}\n`);

    // Cleanup
    await testCollection.deleteMany({ test: true });
    console.log('✅ Cleanup completed\n');

    console.log(
      '🎉 All tests passed! MongoDB replica set is properly configured.\n',
    );

    await app.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Connection test failed:', (error as Error).message);
    console.error('\nTroubleshooting:');
    console.error(
      '1. Ensure Docker containers are running: docker-compose up -d',
    );
    console.error('2. Wait for replica set initialization (15-20 seconds)');
    console.error(
      '3. Check replica set status: docker exec -it pharmacy-mongo1 mongosh --eval "rs.status()"',
    );
    console.error('4. Verify MONGODB_URI in .env file\n');
    process.exit(1);
  }
}

testConnection();
