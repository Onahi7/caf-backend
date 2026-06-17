import {
  Controller,
  Post,
  Body,
  Get,
  Delete,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { WebAuthnService } from './webauthn.service.js';
import {
  WebAuthnRegistrationStartDto,
  WebAuthnRegistrationFinishDto,
  WebAuthnLoginStartDto,
  WebAuthnLoginFinishDto,
} from './dto/webauthn.dto.js';
import {
  GenerateRecoveryCodesDto,
  LoginWithRecoveryCodeDto,
  StepUpStartDto,
  StepUpFinishDto,
} from './dto/webauthn-recovery.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { UserRole } from '../users/schemas/user.schema.js';
import type { CurrentUserData } from '../auth/decorators/current-user.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Throttle } from '@nestjs/throttler';

@Controller('webauthn')
export class WebAuthnController {
  constructor(private readonly service: WebAuthnService) {}

  // -- Registration (requires password-authenticated session) --------------

  @Post('register/start')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async registerStart(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: WebAuthnRegistrationStartDto,
  ) {
    return this.service.startRegistration(user.userId, { deviceName: dto.deviceName });
  }

  @Post('register/finish')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async registerFinish(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: WebAuthnRegistrationFinishDto,
  ) {
    return this.service.finishRegistration(
      user.userId,
      {
        id: dto.id,
        rawId: dto.rawId,
        type: 'public-key',
        response: {
          clientDataJSON: dto.response.clientDataJSON,
          attestationObject: dto.response.attestationObject,
          transports: dto.response.transports,
        },
        authenticatorAttachment: dto.authenticatorAttachment,
        clientExtensionResults: dto.clientExtensionResults,
      },
      { deviceName: dto.deviceName },
    );
  }

  // -- Login (no auth required) --------------------------------------------

  @Post('login/start')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @HttpCode(HttpStatus.OK)
  async loginStart(@Body() dto: WebAuthnLoginStartDto) {
    return this.service.startLogin(dto.username);
  }

  @Post('login/finish')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @HttpCode(HttpStatus.OK)
  async loginFinish(@Body() dto: WebAuthnLoginFinishDto) {
    return this.service.finishLogin({
      id: dto.id,
      rawId: dto.rawId,
      type: 'public-key',
      response: {
        clientDataJSON: dto.response.clientDataJSON,
        authenticatorData: dto.response.authenticatorData,
        signature: dto.response.signature,
        userHandle: dto.response.userHandle,
      },
    });
  }

  // -- Recovery code login (no auth required, single-use) -----------------

  @Post('login/recovery')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @HttpCode(HttpStatus.OK)
  async loginWithRecoveryCode(@Body() dto: LoginWithRecoveryCodeDto) {
    return this.service.loginWithRecoveryCode(dto.username, dto.code);
  }

  // -- Credential management (requires auth) ------------------------------

  @Get('credentials')
  @UseGuards(JwtAuthGuard)
  async listCredentials(@CurrentUser() user: CurrentUserData) {
    const docs = await this.service.listCredentials(user.userId);
    return docs.map((d) => ({
      id: d._id.toString(),
      credentialId: d.credentialId,
      deviceName: d.deviceName,
      transports: d.transports,
      authenticatorAttachment: d.authenticatorAttachment,
      backupEligible: d.backupEligible,
      backupState: d.backupState,
      createdAt: d.get('createdAt'),
      lastUsedAt: d.lastUsedAt,
    }));
  }

  @Delete('credentials/:id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async revoke(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ): Promise<void> {
    await this.service.revokeCredential(user.userId, id);
  }

  // -- Recovery codes (requires auth) -------------------------------------

  @Get('recovery-codes')
  @UseGuards(JwtAuthGuard)
  async recoveryCodeCount(@CurrentUser() user: CurrentUserData) {
    return this.service.countRecoveryCodes(user.userId);
  }

  @Post('recovery-codes/generate')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async generateRecoveryCodes(
    @CurrentUser() user: CurrentUserData,
    @Body() _dto: GenerateRecoveryCodesDto,
  ) {
    return this.service.generateRecoveryCodes(user.userId);
  }

  // -- Step-up auth (5min, single-use token for sensitive ops) ------------

  @Post('step-up/start')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async stepUpStart(
    @CurrentUser() user: CurrentUserData,
    @Body() _dto: StepUpStartDto,
  ) {
    return this.service.startStepUp(user.userId);
  }

  @Post('step-up/finish')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async stepUpFinish(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: StepUpFinishDto,
  ) {
    return this.service.finishStepUp(
      user.userId,
      {
        id: dto.id,
        rawId: dto.rawId,
        type: 'public-key',
        response: {
          clientDataJSON: dto.response.clientDataJSON,
          authenticatorData: dto.response.authenticatorData,
          signature: dto.response.signature,
          userHandle: dto.response.userHandle,
        },
      },
      dto.reason,
    );
  }

  // -- Admin: reset all credentials for a user ----------------------------

  @Post('admin/reset-credentials/:userId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  async adminReset(
    @Param('userId') targetUserId: string,
    @CurrentUser() admin: CurrentUserData,
  ) {
    return this.service.adminResetUserCredentials(admin.userId, targetUserId);
  }
}
