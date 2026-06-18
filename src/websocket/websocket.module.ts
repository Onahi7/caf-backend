import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { WebSocketGateway } from './websocket.gateway.js';
import { EventsService } from './events.service.js';
import { Branch, BranchSchema } from '../branches/schemas/branch.schema.js';

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    MongooseModule.forFeature([
      { name: Branch.name, schema: BranchSchema },
    ]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: '15m',
        },
      }),
    }),
  ],
  providers: [WebSocketGateway, EventsService],
  exports: [WebSocketGateway, EventsService],
})
export class WebSocketModule {}
