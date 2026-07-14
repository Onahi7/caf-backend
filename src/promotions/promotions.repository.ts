import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { Promotion } from './schemas/promotion.schema';
import { CreatePromotionDto } from './dto/create-promotion.dto';
import { UpdatePromotionDto } from './dto/update-promotion.dto';

@Injectable()
export class PromotionsRepository {
  constructor(
    @InjectModel(Promotion.name) private promotionModel: Model<Promotion>,
  ) {}

  async create(
    createPromotionDto: CreatePromotionDto,
    userId: string,
  ): Promise<Promotion> {
    const promotion = new this.promotionModel({
      ...createPromotionDto,
      createdBy: new Types.ObjectId(userId),
      applicableProducts: createPromotionDto.applicableProducts?.map(
        (id) => new Types.ObjectId(id),
      ),
      branchId: createPromotionDto.branchId
        ? new Types.ObjectId(createPromotionDto.branchId)
        : null,
    });
    return promotion.save();
  }

  async findAll(branchId?: string, search?: string): Promise<Promotion[]> {
    const query: any = {};
    if (branchId) {
      query.$or = [
        { branchId: new Types.ObjectId(branchId) },
        { branchId: null },
      ];
    }

    if (search) {
      query.$and = query.$and || [];
      query.$and.push({
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { code: { $regex: search, $options: 'i' } },
        ],
      });
    }

    return this.promotionModel.find(query).sort({ createdAt: -1 }).exec();
  }

  async findActive(branchId?: string): Promise<Promotion[]> {
    const now = new Date();
    const query: any = {
      isActive: true,
      startDate: { $lte: now },
      endDate: { $gte: now },
    };

    if (branchId) {
      query.$or = [
        { branchId: new Types.ObjectId(branchId) },
        { branchId: null },
      ];
    }

    return this.promotionModel.find(query).exec();
  }

  async findById(id: string): Promise<Promotion | null> {
    return this.promotionModel.findById(id).exec();
  }

  async findByCode(code: string): Promise<Promotion | null> {
    const now = new Date();
    return this.promotionModel
      .findOne({
        code,
        isActive: true,
        startDate: { $lte: now },
        endDate: { $gte: now },
      })
      .exec();
  }

  async update(
    id: string,
    updatePromotionDto: UpdatePromotionDto,
  ): Promise<Promotion | null> {
    return this.promotionModel
      .findByIdAndUpdate(id, updatePromotionDto, { new: true })
      .exec();
  }

  async incrementUsage(id: string, session?: ClientSession): Promise<Promotion | null> {
    return this.promotionModel
      .findOneAndUpdate(
        {
          _id: id,
          $expr: {
            $or: [
              { $eq: [{ $ifNull: ['$usageLimit', null] }, null] },
              { $lt: ['$usageCount', '$usageLimit'] },
            ],
          },
        },
        { $inc: { usageCount: 1 } },
        { new: true, ...(session ? { session } : {}) },
      )
      .exec();
  }

  async delete(id: string): Promise<Promotion | null> {
    return this.promotionModel.findByIdAndDelete(id).exec();
  }

  async toggleStatus(id: string): Promise<Promotion | null> {
    const promotion = await this.promotionModel.findById(id).exec();
    if (!promotion) {
      return null;
    }

    promotion.isActive = !promotion.isActive;
    return promotion.save();
  }
}
