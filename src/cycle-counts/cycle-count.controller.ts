import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import {
  CurrentUser,
  CurrentUserData,
} from '../auth/decorators/current-user.decorator.js';
import { UserRole } from '../users/schemas/user.schema.js';
import { CycleCountService } from './cycle-count.service.js';
import { CreateCycleCountDto } from './dto/create-cycle-count.dto.js';
import { SubmitCycleCountDto } from './dto/submit-cycle-count.dto.js';
import { CycleCountStatus } from './schemas/cycle-count.schema.js';

@Controller('cycle-counts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CycleCountController {
  constructor(private readonly service: CycleCountService) {}

  /** POST /cycle-counts — create draft, snapshots all batches */
  @Post()
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.BRANCH_MANAGER,
    UserRole.PHARMACIST,
  )
  create(
    @Body() dto: CreateCycleCountDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.create(dto, user.userId);
  }

  /** GET /cycle-counts?branchId=&status= */
  @Get()
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.BRANCH_MANAGER,
    UserRole.PHARMACIST,
    UserRole.AUDITOR,
  )
  findAll(
    @Query('branchId') branchId: string,
    @Query('status') status?: CycleCountStatus,
  ) {
    return this.service.findAll(branchId, status);
  }

  /** GET /cycle-counts/:id */
  @Get(':id')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.BRANCH_MANAGER,
    UserRole.PHARMACIST,
    UserRole.AUDITOR,
  )
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  /** PATCH /cycle-counts/:id/submit — enter counted quantities */
  @Patch(':id/submit')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.BRANCH_MANAGER,
    UserRole.PHARMACIST,
  )
  submit(@Param('id') id: string, @Body() dto: SubmitCycleCountDto) {
    return this.service.submit(id, dto);
  }

  /** PATCH /cycle-counts/:id/approve — manager applies all variances */
  @Patch(':id/approve')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER)
  approve(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return this.service.approve(id, user.userId);
  }

  /** PATCH /cycle-counts/:id/cancel */
  @Patch(':id/cancel')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER)
  cancel(@Param('id') id: string) {
    return this.service.cancel(id);
  }
}
