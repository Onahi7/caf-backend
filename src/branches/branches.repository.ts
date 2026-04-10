import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Branch, BranchDocument } from './schemas/branch.schema.js';
import { CreateBranchDto } from './dto/create-branch.dto.js';
import { UpdateBranchDto } from './dto/update-branch.dto.js';

@Injectable()
export class BranchesRepository {
  constructor(
    @InjectModel(Branch.name) private branchModel: Model<BranchDocument>,
  ) {}

  async create(createBranchDto: CreateBranchDto): Promise<BranchDocument> {
    const branch = new this.branchModel(createBranchDto);
    return branch.save();
  }

  async findAll(): Promise<BranchDocument[]> {
    return this.branchModel.find().exec();
  }

  async findActive(): Promise<BranchDocument[]> {
    return this.branchModel.find({ isActive: true }).exec();
  }

  async findById(id: string): Promise<BranchDocument | null> {
    return this.branchModel.findById(id).exec();
  }

  async findByCode(code: string): Promise<BranchDocument | null> {
    return this.branchModel.findOne({ code }).exec();
  }

  async findHeadquarters(): Promise<BranchDocument | null> {
    return this.branchModel.findOne({ isHeadquarters: true }).exec();
  }

  async update(
    id: string,
    updateBranchDto: UpdateBranchDto,
  ): Promise<BranchDocument | null> {
    return this.branchModel
      .findByIdAndUpdate(id, updateBranchDto, { new: true })
      .exec();
  }

  async delete(id: string): Promise<BranchDocument | null> {
    return this.branchModel.findByIdAndDelete(id).exec();
  }

  async deactivate(id: string): Promise<BranchDocument | null> {
    return this.branchModel
      .findByIdAndUpdate(id, { isActive: false }, { new: true })
      .exec();
  }
}
