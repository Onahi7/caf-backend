import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';

@Injectable()
export class UsersRepository {
  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) {}

  async create(createUserDto: CreateUserDto): Promise<UserDocument> {
    const user = new this.userModel({
      ...createUserDto,
      passwordHash: createUserDto.password, // Will be hashed by pre-save hook
      branchId: createUserDto.branchId
        ? new Types.ObjectId(createUserDto.branchId)
        : undefined,
    });
    return user.save();
  }

  async findAll(
    role?: string,
    branchId?: string,
    page = 1,
    limit = 20,
  ): Promise<{ data: UserDocument[]; total: number }> {
    const query: Record<string, unknown> = {};

    if (role) {
      query.role = role;
    }

    if (branchId) {
      query.branchId = new Types.ObjectId(branchId);
    }

    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.userModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
      this.userModel.countDocuments(query).exec(),
    ]);

    return { data, total };
  }

  async findById(id: string): Promise<UserDocument | null> {
    return this.userModel.findById(id).exec();
  }

  async findByUsername(username: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ username }).exec();
  }

  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email }).exec();
  }

  async findByBranch(branchId: string): Promise<UserDocument[]> {
    return this.userModel
      .find({ branchId: new Types.ObjectId(branchId) })
      .exec();
  }

  /**
   * Find users who should receive notifications for a given branch + role list.
   * - If branchId is given, returns users in that branch with the specified roles.
   * - If branchId is undefined, returns super_admins (cross-branch notifications).
   */
  async findNotificationRecipients(
    branchId: string | undefined,
    roles: string[],
  ): Promise<UserDocument[]> {
    const roleQuery = { $in: roles };
    if (branchId) {
      return this.userModel
        .find({ branchId: new Types.ObjectId(branchId), role: roleQuery, isActive: { $ne: false } })
        .exec();
    }
    return this.userModel
      .find({ role: roleQuery, isActive: { $ne: false } })
      .exec();
  }

  async update(
    id: string,
    updateUserDto: UpdateUserDto,
  ): Promise<UserDocument | null> {
    if (updateUserDto.password) {
      const user = await this.userModel.findById(id).exec();
      if (!user) {
        return null;
      }

      if (updateUserDto.email !== undefined) user.email = updateUserDto.email;
      if (updateUserDto.firstName !== undefined)
        user.firstName = updateUserDto.firstName;
      if (updateUserDto.lastName !== undefined)
        user.lastName = updateUserDto.lastName;
      if (updateUserDto.role !== undefined) user.role = updateUserDto.role;
      if (updateUserDto.isActive !== undefined)
        user.isActive = updateUserDto.isActive;
      if (updateUserDto.branchId !== undefined) {
        user.branchId = updateUserDto.branchId
          ? new Types.ObjectId(updateUserDto.branchId)
          : undefined;
      }

      user.passwordHash = updateUserDto.password;
      return user.save();
    }

    const updateData: Record<string, unknown> = { ...updateUserDto };

    if (updateUserDto.branchId) {
      updateData.branchId = new Types.ObjectId(updateUserDto.branchId);
    }

    return this.userModel.findByIdAndUpdate(id, updateData, { new: true }).exec();
  }

  async delete(id: string): Promise<UserDocument | null> {
    return this.userModel.findByIdAndDelete(id).exec();
  }

  async deactivate(id: string): Promise<UserDocument | null> {
    return this.userModel
      .findByIdAndUpdate(id, { isActive: false }, { new: true })
      .exec();
  }

  async updatePassword(
    id: string,
    password: string,
  ): Promise<UserDocument | null> {
    const user = await this.userModel.findById(id).exec();
    if (!user) {
      return null;
    }

    user.passwordHash = password;
    return user.save();
  }
}
