import {
  Controller,
  Post,
  Get,
  Body,
  HttpCode,
  HttpStatus,
  NotFoundException,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshTokenDto } from './dto/refresh-token.dto.js';
import { TokenResponseDto } from './dto/token-response.dto.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { BiometricRegisterDto } from './dto/biometric-register.dto.js';
import { BiometricVerifyDto } from './dto/biometric-verify.dto.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import type { CurrentUserData } from './decorators/current-user.decorator.js';
import { UsersService } from '../users/users.service.js';

@Controller('auth')
@SkipThrottle() // individual routes opt-in or override below
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
  ) {}

  @Post('login')
  @Throttle({ default: { ttl: 60000, limit: 5 } }) // 5 login attempts per minute
  @HttpCode(HttpStatus.OK)
  async login(@Body() loginDto: LoginDto): Promise<TokenResponseDto> {
    return this.authService.login(loginDto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body() refreshTokenDto: RefreshTokenDto,
  ): Promise<TokenResponseDto> {
    return this.authService.refresh(refreshTokenDto.refreshToken);
  }

  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  async getCurrentUser(@CurrentUser() currentUser: CurrentUserData) {
    const user = await this.usersService.findById(currentUser.userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      id: user._id.toString(),
      username: user.username,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      branchId: user.branchId?.toString(),
      isActive: user.isActive,
    };
  }

  @Post('logout')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@CurrentUser() user: CurrentUserData): Promise<void> {
    await this.authService.logout(user.userId, user.username);
  }

  @Post('change-password')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: ChangePasswordDto,
  ): Promise<{ message: string }> {
    await this.authService.changePassword(
      user.userId,
      dto.currentPassword,
      dto.newPassword,
    );

    return { message: 'Password changed successfully' };
  }

  // ── Biometric endpoints ────────────────────────────────────────────────────

  @Post('biometric/register')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.OK)
  async biometricRegister(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: BiometricRegisterDto,
  ): Promise<{ biometricToken: string }> {
    return this.authService.registerBiometric(user.userId, dto.deviceId);
  }

  @Post('biometric/verify')
  @Throttle({ default: { ttl: 60000, limit: 5 } }) // same rate limit as login
  @HttpCode(HttpStatus.OK)
  async biometricVerify(
    @Body() dto: BiometricVerifyDto,
  ): Promise<TokenResponseDto> {
    return this.authService.verifyBiometric(dto.username, dto.deviceId, dto.biometricToken);
  }
}
