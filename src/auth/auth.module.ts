import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service.js';
import { AuthController } from './auth.controller.js';
import { JwtStrategy } from './strategies/jwt.strategy.js';
import { StepUpTokenService } from './services/step-up-token.service.js';
import { StepUpGuard } from './guards/step-up.guard.js';
import { UsersModule } from '../users/users.module.js';
import { RedisModule } from '../redis/redis.module.js';
import { AuditModule } from '../audit/audit.module.js';

@Module({
  imports: [
    UsersModule,
    RedisModule,
    AuditModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const jwtSecret = configService.get<string>('JWT_SECRET');
        if (!jwtSecret) {
          throw new Error('JWT_SECRET is required');
        }

        return {
          secret: jwtSecret,
          signOptions: {
            expiresIn: (configService.get<string>('JWT_EXPIRATION') || '14h') as any,
          },
        };
      },
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, StepUpTokenService, StepUpGuard],
  exports: [AuthService, PassportModule, JwtModule, StepUpTokenService, StepUpGuard],
})
export class AuthModule {}
