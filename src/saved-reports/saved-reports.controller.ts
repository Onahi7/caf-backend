import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { SavedReportsService } from './saved-reports.service.js';
import { CreateSavedReportDto, UpdateSavedReportDto } from './dto/saved-report.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { UserRole } from '../users/schemas/user.schema.js';

interface AuthedRequest extends Request {
  user: { sub: string };
}

@Controller('saved-reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(
  UserRole.SUPER_ADMIN,
  UserRole.BRANCH_MANAGER,
  UserRole.FINANCE_MANAGER,
  UserRole.AUDITOR,
  UserRole.CASHIER,
)
export class SavedReportsController {
  constructor(private readonly service: SavedReportsService) {}

  @Get()
  list(@Req() req: AuthedRequest) {
    return this.service.list(req.user.sub);
  }

  @Get(':id')
  get(@Param('id') id: string, @Req() req: AuthedRequest) {
    return this.service.get(id, req.user.sub);
  }

  @Post()
  create(@Body() dto: CreateSavedReportDto, @Req() req: AuthedRequest) {
    return this.service.create(req.user.sub, dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSavedReportDto,
    @Req() req: AuthedRequest,
  ) {
    return this.service.update(id, req.user.sub, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string, @Req() req: AuthedRequest) {
    return this.service.remove(id, req.user.sub);
  }
}
