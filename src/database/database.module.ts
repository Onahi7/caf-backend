import { Module, Global } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TransactionService } from './transaction.service';

@Global()
@Module({
  imports: [
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        uri: configService.get<string>('MONGODB_URI'),
        // Connection pool settings
        maxPoolSize: 10,
        minPoolSize: 2,
        // Timeout settings
        serverSelectionTimeoutMS: 30000, // Increased for cloud connections
        socketTimeoutMS: 45000,
        // Retry settings
        retryWrites: true,
        retryReads: true,
        // Auto index creation in development
        autoIndex: process.env.NODE_ENV !== 'production',
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [TransactionService],
  exports: [TransactionService],
})
export class DatabaseModule {}
