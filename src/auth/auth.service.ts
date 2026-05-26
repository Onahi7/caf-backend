import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service.js';
import { LoginDto } from './dto/login.dto.js';
import { TokenResponseDto } from './dto/token-response.dto.js';
import { RedisService } from '../redis/redis.service.js';
import { JwtPayload } from './strategies/jwt.strategy.js';
import { AuditService } from '../audit/audit.service.js';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly ACCESS_TOKEN_EXPIRY = 14 * 60 * 60; // 14 hours in seconds
  private readonly REFRESH_TOKEN_EXPIRY = 7 * 24 * 60 * 60; // 7 days in seconds

  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private redisService: RedisService,
    private auditService: AuditService,
  ) {
    // Validate required configuration on startup
    const jwtSecret = this.configService.get<string>('JWT_SECRET');
    const jwtRefreshSecret = this.configService.get<string>('JWT_REFRESH_SECRET');
    
    if (!jwtSecret || !jwtRefreshSecret) {
      this.logger.error('JWT secrets are not properly configured');
      throw new InternalServerErrorException('Authentication service is not properly configured');
    }
  }

  async login(loginDto: LoginDto): Promise<TokenResponseDto> {
    const user = await this.usersService.findByUsername(loginDto.username);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('User account is inactive');
    }

    const isPasswordValid = await user.comparePassword(loginDto.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload: JwtPayload = {
      sub: user._id.toString(),
      username: user.username,
      role: user.role,
      branchId: user.branchId?.toString(),
    };

    const accessToken = this.jwtService.sign(payload);

    const refreshSecret = this.configService.get<string>('JWT_REFRESH_SECRET');
    if (!refreshSecret) {
      this.logger.error('JWT_REFRESH_SECRET is not configured');
      throw new InternalServerErrorException('Authentication service configuration error');
    }

    const refreshExpiration = this.configService.get<string>('JWT_REFRESH_EXPIRATION') || '7d';
    const refreshToken = this.jwtService.sign(
      payload as Record<string, any>,
      {
        secret: refreshSecret,
        expiresIn: refreshExpiration as any,
      },
    );

    // Store refresh token in Redis with expiration
    await this.redisService.set(
      `refresh_token:${user._id.toString()}`,
      refreshToken,
      this.REFRESH_TOKEN_EXPIRY,
    );

    try {
      await this.auditService.logLogin(user._id.toString(), user.username);
    } catch (auditError) {
      const auditMessage =
        auditError instanceof Error ? auditError.message : 'Unknown audit error';
      this.logger.warn(`Login audit failed for ${user.username}: ${auditMessage}`);
    }

    this.logger.log(`User ${user.username} logged in successfully`);

    return {
      user: {
        id: user._id.toString(),
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        branchId: user.branchId?.toString(),
      },
      accessToken,
      refreshToken,
      expiresIn: this.ACCESS_TOKEN_EXPIRY,
      refreshExpiresIn: this.REFRESH_TOKEN_EXPIRY,
    };
  }

  async refresh(refreshToken: string): Promise<TokenResponseDto> {
    try {
      const refreshSecret = this.configService.get<string>('JWT_REFRESH_SECRET');
      if (!refreshSecret) {
        this.logger.error('JWT_REFRESH_SECRET is not configured');
        throw new InternalServerErrorException('Authentication service configuration error');
      }

      const payload = this.jwtService.verify<JwtPayload>(refreshToken, {
        secret: refreshSecret,
      });

      // Check if refresh token exists in Redis
      const storedToken = await this.redisService.get(
        `refresh_token:${payload.sub}`,
      );

      if (!storedToken || storedToken !== refreshToken) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      // Verify user still exists and is active
      const user = await this.usersService.findById(payload.sub);
      if (!user || !user.isActive) {
        throw new UnauthorizedException('User not found or inactive');
      }

      // Generate new access token
      const newPayload: JwtPayload = {
        sub: user._id.toString(),
        username: user.username,
        role: user.role,
        branchId: user.branchId?.toString(),
      };

      const accessToken = this.jwtService.sign(newPayload);

      this.logger.log(`Token refreshed for user ${user.username}`);

      return {
        user: {
          id: user._id.toString(),
          username: user.username,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          branchId: user.branchId?.toString(),
        },
        accessToken,
        refreshToken, // Return the same refresh token
        expiresIn: this.ACCESS_TOKEN_EXPIRY,
        refreshExpiresIn: this.REFRESH_TOKEN_EXPIRY,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`Token refresh failed: ${errorMessage}`);
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  async logout(userId: string, username: string): Promise<void> {
    try {
      // Remove refresh token from Redis
      await this.redisService.del(`refresh_token:${userId}`);
      
      // Log the logout action for audit trail
      await this.auditService.logLogout(userId, username);
      
      this.logger.log(`User ${username} logged out successfully`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Logout failed for user ${username}: ${errorMessage}`);
      throw error;
    }
  }

  async validateToken(token: string): Promise<JwtPayload> {
    try {
      return this.jwtService.verify<JwtPayload>(token);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`Token validation failed: ${errorMessage}`);
      throw new UnauthorizedException('Invalid token');
    }
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.usersService.findById(userId);

    const isCurrentPasswordValid = await user.comparePassword(currentPassword);
    if (!isCurrentPasswordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const isSamePassword = await user.comparePassword(newPassword);
    if (isSamePassword) {
      throw new BadRequestException(
        'New password must be different from current password',
      );
    }

    await this.usersService.changePassword(userId, newPassword);
    this.logger.log(`Password changed successfully for user ${user.username}`);
  }

  // ── Biometric auth ──────────────────────────────────────────────────────────

  private readonly BIOMETRIC_TOKEN_EXPIRY = 30 * 24 * 60 * 60; // 30 days

  /**
   * Called after a successful password login if the user opts in to biometric.
   * Generates a one-time secure token tied to userId + deviceId and stores it
   * in Redis. The frontend saves the token in device secure storage.
   */
  async registerBiometric(userId: string, deviceId: string): Promise<{ biometricToken: string }> {
    const user = await this.usersService.findById(userId);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive');
    }

    const biometricToken = randomBytes(40).toString('hex');
    const key = `biometric:${userId}:${deviceId}`;
    await this.redisService.set(key, biometricToken, this.BIOMETRIC_TOKEN_EXPIRY);

    this.logger.log(`Biometric registered for user ${user.username} device ${deviceId}`);
    return { biometricToken };
  }

  /**
   * Called when the user taps the fingerprint button on the login screen.
   * The frontend retrieves the stored biometricToken from device secure storage
   * (only accessible after OS biometric check), then sends it here.
   * Returns a full token response on success.
   */
  async verifyBiometric(username: string, deviceId: string, biometricToken: string): Promise<TokenResponseDto> {
    const user = await this.usersService.findByUsername(username);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid biometric credential');
    }

    const key = `biometric:${user._id.toString()}:${deviceId}`;
    const storedToken = await this.redisService.get(key);

    if (!storedToken || storedToken !== biometricToken) {
      throw new UnauthorizedException('Invalid or expired biometric credential');
    }

    const payload: JwtPayload = {
      sub: user._id.toString(),
      username: user.username,
      role: user.role,
      branchId: user.branchId?.toString(),
    };

    const accessToken = this.jwtService.sign(payload);

    const refreshSecret = this.configService.get<string>('JWT_REFRESH_SECRET')!;
    const refreshExpiration = this.configService.get<string>('JWT_REFRESH_EXPIRATION') || '7d';
    const refreshToken = this.jwtService.sign(payload as Record<string, any>, {
      secret: refreshSecret,
      expiresIn: refreshExpiration as any,
    });

    await this.redisService.set(
      `refresh_token:${user._id.toString()}`,
      refreshToken,
      this.REFRESH_TOKEN_EXPIRY,
    );

    this.logger.log(`Biometric login successful for user ${user.username}`);

    return {
      user: {
        id: user._id.toString(),
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        branchId: user.branchId?.toString(),
      },
      accessToken,
      refreshToken,
      expiresIn: this.ACCESS_TOKEN_EXPIRY,
      refreshExpiresIn: this.REFRESH_TOKEN_EXPIRY,
    };
  }
}
