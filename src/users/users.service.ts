import {
  Injectable,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
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
    @InjectModel(Branch.name) private readonly branchModel: Model<BranchDocument>,
  ) {}

  private async canManageAcrossBranches(
    actor?: { role: string; branchId?: string },
  ): Promise<boolean> {
    if (!actor) {
      return false;
    }

    if (actor.role === UserRole.SUPER_ADMIN) {
      return true;
    }

    if (actor.role !== UserRole.BRANCH_MANAGER || !actor.branchId) {
      return false;
    }

    const branch = await this.branchModel
      .findById(actor.branchId)
      .select('isHeadquarters')
      .lean();

    return Boolean(branch?.isHeadquarters);
  }

  private async applyBranchScopeForWrite<T extends CreateUserDto | UpdateUserDto>(
    dto: T,
    actor?: { role: string; branchId?: string },
  ): Promise<T> {
    if (!actor) {
      throw new ForbiddenException('User context is required');
    }

    if (actor.role === UserRole.SUPER_ADMIN) {
      return dto;
    }

    if (actor.role !== UserRole.BRANCH_MANAGER) {
      throw new ForbiddenException('You are not allowed to manage users');
    }

    if (!actor.branchId) {
      throw new ForbiddenException(
        'Your account is not assigned to a branch. Contact an administrator.',
      );
    }

    if (dto.role === UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Only super admins can manage super admin users');
    }

    const canChooseBranch = await this.canManageAcrossBranches(actor);
    if (canChooseBranch) {
      return dto;
    }

    if (
      dto.role &&
      ![UserRole.CASHIER, UserRole.MARKETER].includes(dto.role)
    ) {
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
    if (!actor || actor.role === UserRole.SUPER_ADMIN) {
      return;
    }

    if (actor.role !== UserRole.BRANCH_MANAGER || !actor.branchId) {
      throw new ForbiddenException('You are not allowed to manage this user');
    }

    const canChooseBranch = await this.canManageAcrossBranches(actor);
    if (canChooseBranch) {
      return;
    }

    if (target.branchId?.toString() !== actor.branchId) {
      throw new ForbiddenException('You can only manage users in your outlet');
    }
  }

  async create(
    createUserDto: CreateUserDto,
    actor?: { role: string; branchId?: string },
  ): Promise<UserDocument> {
    const scopedDto = await this.applyBranchScopeForWrite(createUserDto, actor);

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
  ): Promise<{ data: UserDocument[]; total: number }> {
    const branchId = user?.role === UserRole.BRANCH_MANAGER ? user.branchId : undefined;

    if (!user || user.role === UserRole.SUPER_ADMIN || user.role === UserRole.BRANCH_MANAGER) {
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

  async findByBranch(branchId: string): Promise<UserDocument[]> {
    return this.usersRepository.findByBranch(branchId);
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
    return user;
  }

  async delete(id: string): Promise<void> {
    const user = await this.usersRepository.delete(id);
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
  }

  async deactivate(id: string): Promise<UserDocument> {
    const user = await this.usersRepository.deactivate(id);
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
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
