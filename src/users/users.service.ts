import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { UsersRepository } from './users.repository.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { UserDocument } from './schemas/user.schema.js';
import { UserRole } from './schemas/user.schema.js';

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  async create(createUserDto: CreateUserDto): Promise<UserDocument> {
    // Check if username already exists
    const existingUsername = await this.usersRepository.findByUsername(
      createUserDto.username,
    );
    if (existingUsername) {
      throw new ConflictException('Username already exists');
    }

    // Check if email already exists
    const existingEmail = await this.usersRepository.findByEmail(
      createUserDto.email,
    );
    if (existingEmail) {
      throw new ConflictException('Email already exists');
    }

    return this.usersRepository.create(createUserDto);
  }

  async findAll(user?: {
    role: string;
    branchId?: string;
  }, role?: UserRole): Promise<UserDocument[]> {
    let users: UserDocument[];

    if (!user || user.role === UserRole.SUPER_ADMIN) {
      users = await this.usersRepository.findAll();
      return role ? users.filter((u) => u.role === role) : users;
    }

    if (user.role === UserRole.BRANCH_MANAGER && user.branchId) {
      users = await this.usersRepository.findByBranch(user.branchId);
      return role ? users.filter((u) => u.role === role) : users;
    }

    // For other roles, return empty array or throw forbidden
    // Since the guard already checks roles, this shouldn't happen
    return [];
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

  async update(
    id: string,
    updateUserDto: UpdateUserDto,
  ): Promise<UserDocument> {
    // Check if email is being updated and already exists
    if (updateUserDto.email) {
      const existingEmail = await this.usersRepository.findByEmail(
        updateUserDto.email,
      );
      if (existingEmail && existingEmail._id.toString() !== id) {
        throw new ConflictException('Email already exists');
      }
    }

    const user = await this.usersRepository.update(id, updateUserDto);
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
