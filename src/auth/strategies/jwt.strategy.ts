import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UsersService } from '../../users/users.service.js';

export interface JwtPayload {
  sub: string;
  username: string;
  role: string;
  branchId?: string;
  fieldZoneCode?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private usersService: UsersService,
  ) {
    const jwtSecret = configService.get<string>('JWT_SECRET');
    if (!jwtSecret) {
      throw new Error('JWT_SECRET is required');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtSecret,
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.usersService.findById(payload.sub);

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive');
    }
    try {
      await this.usersService.assertActiveAssignment(user);
    } catch {
      throw new UnauthorizedException(
        'User branch assignment is missing or inactive',
      );
    }

    return {
      userId: payload.sub,
      username: user.username,
      role: user.role,
      branchId: user.branchId?.toString(),
      fieldZoneCode: user.fieldZoneCode,
    };
  }
}
