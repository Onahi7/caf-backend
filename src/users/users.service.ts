import {
  Injectable,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { CurrentUserData } from '../auth/decorators/current-user.decorator.js';
import { resolveBranchId } from '../common/utils/branch-scope.util.js';
import { UsersRepository } from './users.repository.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { UserDocument } from './schemas/user.schema.js';
import { UserRole } from './schemas/user.schema.js';
import { Branch, BranchDocument } from '../branches/schemas/branch.schema.js';

@Injectable()
export class UsersService {
  constructor(
    private readonly usersRepository: UsersRepository,
    @InjectModel(Branch.name)
    private readonly branchModel: Model<BranchDocument>,
    private readonly events: EventEmitter2,
  ) {}

  private async canManageAcrossBranches(actor?: {
    role: string;
    branchId?: string;
  }): Promise<boolean> {
    if (!actor) {
      return false;
    }

    if (actor.role === String(UserRole.SUPER_ADMIN)) {
      return true;
    }

    if (actor.role !== String(UserRole.BRANCH_MANAGER) || !actor.branchId) {
      return false;
    }

    const branch = await this.branchModel
      .findById(actor.branchId)
      .select('isHeadquarters isActive')
      .lean();

    return Boolean(branch?.isHeadquarters && branch.isActive);
  }

  private async validateAssignment(
    role: UserRole,
    branchId?: string | null,
  ): Promise<void> {
    if (!branchId) {
      if (
        [UserRole.BRANCH_MANAGER, UserRole.CASHIER, UserRole.MARKETER].includes(
          role,
        )
      ) {
        throw new BadRequestException('A branch is required for this role');
      }
      return;
    }
    if (!Types.ObjectId.isValid(branchId)) {
      throw new BadRequestException('Invalid branch ID');
    }
    const branch = await this.branchModel
      .findById(branchId)
      .select('isActive')
      .lean();
    if (!branch?.isActive) {
      throw new BadRequestException(
        'Staff must be assigned to an existing active branch',
      );
    }
  }

  async assertActiveAssignment(user: UserDocument): Promise<void> {
    await this.validateAssignment(user.role, user.branchId?.toString());
  }

  private async canReadAcrossBranches(
    actor: CurrentUserData,
  ): Promise<boolean> {
    return (
      (actor.role === String(UserRole.AUDITOR) && !actor.branchId) ||
      this.canManageAcrossBranches(actor)
    );
  }

  private async resolveReadBranch(
    actor: CurrentUserData,
    branchId?: string,
  ): Promise<string | undefined> {
    if (branchId && !Types.ObjectId.isValid(branchId)) {
      throw new BadRequestException('Invalid branch ID');
    }
    if (await this.canReadAcrossBranches(actor)) {
      return branchId;
    }
    return resolveBranchId(actor, branchId);
  }

  private async applyBranchScopeForWrite<
    T extends CreateUserDto | UpdateUserDto,
  >(dto: T, actor?: { role: string; branchId?: string }): Promise<T> {
    if (!actor) {
      throw new ForbiddenException('User context is required');
    }

    if (actor.role === String(UserRole.SUPER_ADMIN)) {
      return dto;
    }

    if (actor.role !== String(UserRole.BRANCH_MANAGER)) {
      throw new ForbiddenException('You are not allowed to manage users');
    }

    if (!actor.branchId) {
      throw new ForbiddenException(
        'Your account is not assigned to a branch. Contact an administrator.',
      );
    }

    if (dto.role === UserRole.SUPER_ADMIN) {
      throw new ForbiddenException(
        'Only super admins can manage super admin users',
      );
    }

    const canChooseBranch = await this.canManageAcrossBranches(actor);
    if (canChooseBranch) {
      return dto;
    }

    if (dto.role && ![UserRole.CASHIER, UserRole.MARKETER].includes(dto.role)) {
      throw new ForbiddenException(
        'Outlet managers can only manage cashier and marketer users',
      );
    }

    return {
      ...dto,
      branchId: actor.branchId,
    };
  }

  private async assertCanManageTargetUser(
    target: UserDocument,
    actor?: { role: string; branchId?: string },
  ): Promise<void> {
    if (!actor) throw new ForbiddenException('User context is required');
    if (actor.role === String(UserRole.SUPER_ADMIN)) {
      return;
    }

    if (actor.role !== String(UserRole.BRANCH_MANAGER) || !actor.branchId) {
      throw new ForbiddenException('You are not allowed to manage this user');
    }

    if (target.role === UserRole.SUPER_ADMIN) {
      throw new ForbiddenException(
        'Only super admins can manage super admin users',
      );
    }

    const canChooseBranch = await this.canManageAcrossBranches(actor);
    if (canChooseBranch) {
      return;
    }

    if (target.branchId?.toString() !== actor.branchId) {
      throw new ForbiddenException('You can only manage users in your outlet');
    }
    if (![UserRole.CASHIER, UserRole.MARKETER].includes(target.role)) {
      throw new ForbiddenException(
        'Outlet managers can only manage cashier and marketer users',
      );
    }
  }

  async create(
    createUserDto: CreateUserDto,
    actor?: { role: string; branchId?: string },
  ): Promise<UserDocument> {
    const scopedDto = await this.applyBranchScopeForWrite(createUserDto, actor);
    await this.validateAssignment(scopedDto.role, scopedDto.branchId);

    // Check if username already exists
    const existingUsername = await this.usersRepository.findByUsername(
      scopedDto.username,
    );
    if (existingUsername) {
      throw new ConflictException('Username already exists');
    }

    // Check if email already exists
    const existingEmail = await this.usersRepository.findByEmail(
      scopedDto.email,
    );
    if (existingEmail) {
      throw new ConflictException('Email already exists');
    }

    return this.usersRepository.create(scopedDto);
  }

  async findAll(
    user?: { role: string; branchId?: string },
    role?: UserRole,
    page = 1,
    limit = 20,
    requestedBranchId?: string,
  ): Promise<{ data: UserDocument[]; total: number }> {
    if (!user) throw new ForbiddenException('User context is required');
    if (
      !Number.isInteger(page) ||
      page < 1 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 500
    ) {
      throw new BadRequestException(
        'page must be positive and limit must be between 1 and 500',
      );
    }
    const branchId = await this.resolveReadBranch(
      user as CurrentUserData,
      requestedBranchId,
    );

    if (
      !user ||
      user.role === String(UserRole.SUPER_ADMIN) ||
      user.role === String(UserRole.BRANCH_MANAGER)
    ) {
      return this.usersRepository.findAll(role, branchId, page, limit);
    }

    // For other roles, return empty
    return { data: [], total: 0 };
  }

  async findById(id: string): Promise<UserDocument> {
    const user = await this.usersRepository.findById(id);
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return user;
  }

  async findByUsername(username: string): Promise<UserDocument | null> {
    return this.usersRepository.findByUsername(username);
  }

  async findByBranch(
    branchId: string,
    actor: CurrentUserData,
  ): Promise<UserDocument[]> {
    await this.resolveReadBranch(actor, branchId);
    return this.usersRepository.findByBranch(branchId);
  }

  async findVisibleById(
    id: string,
    actor: CurrentUserData,
  ): Promise<UserDocument> {
    const target = await this.findById(id);
    if (!(await this.canReadAcrossBranches(actor))) {
      if (!target.branchId)
        throw new ForbiddenException('This user is outside your branch');
      await this.resolveReadBranch(actor, target.branchId.toString());
    }
    return target;
  }

  async findNotificationRecipients(
    branchId: string | undefined,
    roles: string[],
  ): Promise<UserDocument[]> {
    return this.usersRepository.findNotificationRecipients(branchId, roles);
  }

  async update(
    id: string,
    updateUserDto: UpdateUserDto,
    actor?: { role: string; branchId?: string },
  ): Promise<UserDocument> {
    const targetUser = await this.findById(id);
    await this.assertCanManageTargetUser(targetUser, actor);
    const scopedDto = await this.applyBranchScopeForWrite(updateUserDto, actor);
    const branchId =
      scopedDto.branchId === undefined
        ? targetUser.branchId?.toString()
        : scopedDto.branchId;
    // Deactivation must remain possible for legacy staff with an invalid assignment.
    if (
      !(
        scopedDto.isActive === false &&
        Object.keys(updateUserDto).every((key) => key === 'isActive')
      )
    ) {
      await this.validateAssignment(
        scopedDto.role ?? targetUser.role,
        branchId,
      );
    }

    // Check if email is being updated and already exists
    if (scopedDto.email) {
      const existingEmail = await this.usersRepository.findByEmail(
        scopedDto.email,
      );
      if (existingEmail && existingEmail._id.toString() !== id) {
        throw new ConflictException('Email already exists');
      }
    }

    const user = await this.usersRepository.update(id, scopedDto);
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    if (
      scopedDto.password ||
      (scopedDto.role !== undefined && scopedDto.role !== targetUser.role) ||
      (scopedDto.branchId !== undefined &&
        (scopedDto.branchId || undefined) !==
          targetUser.branchId?.toString()) ||
      (scopedDto.isActive !== undefined &&
        scopedDto.isActive !== targetUser.isActive)
    ) {
      this.events.emit('user.access.changed', { userId: id.toLowerCase() });
    }
    return user;
  }

  async delete(id: string): Promise<void> {
    const user = await this.usersRepository.delete(id);
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    this.events.emit('user.access.changed', { userId: id.toLowerCase() });
  }

  async deactivate(id: string, actor: CurrentUserData): Promise<UserDocument> {
    const target = await this.findById(id);
    await this.assertCanManageTargetUser(target, actor);
    const user = await this.usersRepository.deactivate(id);
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    this.events.emit('user.access.changed', { userId: id.toLowerCase() });
    return user;
  }

  async changePassword(id: string, newPassword: string): Promise<UserDocument> {
    const user = await this.usersRepository.updatePassword(id, newPassword);
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return user;
  }
}
