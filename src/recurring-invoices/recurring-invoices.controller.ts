import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { RecurringInvoicesService } from './recurring-invoices.service.js';
import {
  CreateRecurringInvoiceDto,
  UpdateRecurringInvoiceDto,
} from './dto/recurring-invoice.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { UserRole } from '../users/schemas/user.schema.js';

interface AuthedRequest extends Request {
  user: { userId: string; role: string; branchId?: string };
}

@Controller('recurring-invoices')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(
  UserRole.SUPER_ADMIN,
  UserRole.BRANCH_MANAGER,
  UserRole.FINANCE_MANAGER,
)
export class RecurringInvoicesController {
  constructor(private readonly service: RecurringInvoicesService) {}

  @Get()
  list(
    @Req() req: AuthedRequest,
    @Query('branchId') branchId?: string,
    @Query('activeOnly') activeOnly?: string,
  ) {
    return this.service.list(req.user.userId, branchId, { activeOnly: activeOnly === 'true' });
  }

  @Get(':id')
  get(@Param('id') id: string, @Req() req: AuthedRequest) {
    return this.service.get(id, req.user.userId);
  }

  @Post()
  create(@Body() dto: CreateRecurringInvoiceDto, @Req() req: AuthedRequest) {
    return this.service.create(req.user.userId, dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateRecurringInvoiceDto,
    @Req() req: AuthedRequest,
  ) {
    return this.service.update(id, req.user.userId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string, @Req() req: AuthedRequest) {
    return this.service.remove(id, req.user.userId);
  }

  /** Create a draft invoice and advance the schedule. */
  @Post(':id/run-now')
  async runNow(@Param('id') id: string, @Req() req: AuthedRequest) {
    const result = await this.service.materialize(id, req.user.userId);
    return { ok: true, ...result };
  }

  /**
   * Returns the data to create a Sale from this template.
   * Useful for the frontend "Generate next invoice" flow.
   */
  @Get(':id/template')
  async getTemplate(@Param('id') id: string, @Req() req: AuthedRequest) {
    const doc = await this.service.get(id, req.user.userId);
    return this.service.toSaleTemplate(doc);
  }
}
