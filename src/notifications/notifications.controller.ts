import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Param,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';

interface AuthedRequest extends Request {
  user: { sub: string; role: string; branchId?: string };
}

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  async list(
    @Req() req: AuthedRequest,
    @Query('limit') limit?: string,
    @Query('unreadOnly') unreadOnly?: string,
  ) {
    return this.notificationsService.listForUser(req.user.sub, {
      limit: limit ? Number(limit) : undefined,
      unreadOnly: unreadOnly === 'true',
    });
  }

  @Get('unread-count')
  async unreadCount(@Req() req: AuthedRequest) {
    const count = await this.notificationsService.countUnread(req.user.sub);
    return { count };
  }

  @Patch(':id/read')
  async markRead(@Param('id') id: string, @Req() req: AuthedRequest) {
    return this.notificationsService.markRead(id, req.user.sub);
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  async markAllRead(@Req() req: AuthedRequest) {
    const modified = await this.notificationsService.markAllRead(req.user.sub);
    return { modified };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string, @Req() req: AuthedRequest) {
    await this.notificationsService.remove(id, req.user.sub);
  }
}
