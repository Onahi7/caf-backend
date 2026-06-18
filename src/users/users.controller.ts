import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { UsersService } from './users.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { UserDocument } from './schemas/user.schema.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { CurrentUserData } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { UserRole } from './schemas/user.schema.js';

@ApiTags('Users')
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * Create a new user
   * POST /users
   * Super Admin and Branch Manager can create users
   */
  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER)
  async create(
    @Body() createUserDto: CreateUserDto,
    @CurrentUser() user: CurrentUserData,
  ): Promise<UserDocument> {
    return this.usersService.create(createUserDto, user);
  }

  /**
   * Get all users
   * GET /users
   * Super Admin sees all users, Branch Manager sees only their branch users
   */
  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER)
  async findAll(
    @CurrentUser() user: CurrentUserData,
    @Query('role') role?: UserRole,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
  ) {
    const p = parseInt(page, 10);
    const l = parseInt(limit, 10);
    const { data, total } = await this.usersService.findAll(user, role, p, l);
    return {
      success: true,
      data,
      count: total,
      pagination: {
        page: p,
        limit: l,
        total,
        pages: Math.ceil(total / l),
        hasNext: p < Math.ceil(total / l),
        hasPrev: p > 1,
      },
    };
  }

  /**
   * Get users by branch
   * GET /users/branch/:branchId
   */
  @Get('branch/:branchId')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.BRANCH_MANAGER,
    UserRole.AUDITOR,
  )
  async findByBranch(
    @Param('branchId') branchId: string,
  ): Promise<UserDocument[]> {
    return this.usersService.findByBranch(branchId);
  }

  /**
   * Get a specific user by ID
   * GET /users/:id
   */
  @Get(':id')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.BRANCH_MANAGER,
    UserRole.AUDITOR,
  )
  async findById(@Param('id') id: string): Promise<UserDocument> {
    return this.usersService.findById(id);
  }

  /**
   * Update a user
   * PATCH /users/:id
   * Super Admin and Branch Manager can update users
   */
  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER)
  async update(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
    @CurrentUser() user: CurrentUserData,
  ): Promise<UserDocument> {
    return this.usersService.update(id, updateUserDto, user);
  }

  /**
   * Deactivate a user
   * PATCH /users/:id/deactivate
   * Super Admin and Branch Manager can deactivate users
   */
  @Patch(':id/deactivate')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER)
  async deactivate(@Param('id') id: string): Promise<UserDocument> {
    return this.usersService.deactivate(id);
  }

  /**
   * Delete a user
   * DELETE /users/:id
   * Only Super Admin can permanently delete users
   */
  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string): Promise<void> {
    return this.usersService.delete(id);
  }
}
