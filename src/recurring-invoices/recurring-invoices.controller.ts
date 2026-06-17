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

interface AuthedRequest extends Request {
  user: { sub: string; role: string; branchId?: string };
}

@Controller('recurring-invoices')
@UseGuards(JwtAuthGuard)
export class RecurringInvoicesController {
  constructor(private readonly service: RecurringInvoicesService) {}

  @Get()
  list(
    @Req() req: AuthedRequest,
    @Query('branchId') branchId?: string,
    @Query('activeOnly') activeOnly?: string,
  ) {
    return this.service.list(req.user.sub, branchId, { activeOnly: activeOnly === 'true' });
  }

  @Get(':id')
  get(@Param('id') id: string, @Req() req: AuthedRequest) {
    return this.service.get(id, req.user.sub);
  }

  @Post()
  create(@Body() dto: CreateRecurringInvoiceDto, @Req() req: AuthedRequest) {
    return this.service.create(req.user.sub, dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateRecurringInvoiceDto,
    @Req() req: AuthedRequest,
  ) {
    return this.service.update(id, req.user.sub, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string, @Req() req: AuthedRequest) {
    return this.service.remove(id, req.user.sub);
  }

  /**
   * Mark this template as run now (updates nextRunAt, runCount, etc.).
   * Does NOT actually create a Sale - that's the caller's job.
   */
  @Post(':id/run-now')
  async runNow(@Param('id') id: string, @Req() req: AuthedRequest) {
    await this.service.validateOwnership(id, req.user.sub);
    const result = await this.service.recordRun(id);
    return { ok: true, ...result };
  }

  /**
   * Returns the data to create a Sale from this template.
   * Useful for the frontend "Generate next invoice" flow.
   */
  @Get(':id/template')
  async getTemplate(@Param('id') id: string, @Req() req: AuthedRequest) {
    const doc = await this.service.get(id, req.user.sub);
    return this.service.toSaleTemplate(doc);
  }
}
