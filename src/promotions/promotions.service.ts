import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PromotionsRepository } from './promotions.repository';
import { CreatePromotionDto } from './dto/create-promotion.dto';
import { UpdatePromotionDto } from './dto/update-promotion.dto';
import {
  Promotion,
  PromotionScope,
  PromotionType,
} from './schemas/promotion.schema';

interface CartItem {
  productId: string;
  quantity: number;
  unitPrice: number;
  category?: string;
}

export interface DiscountResult {
  promotionId: string;
  promotionName: string;
  discountAmount: number;
  appliedTo: 'transaction' | 'item';
  itemId?: string;
}

@Injectable()
export class PromotionsService {
  constructor(private readonly promotionsRepository: PromotionsRepository) {}

  async create(
    createPromotionDto: CreatePromotionDto,
    userId: string,
  ): Promise<Promotion> {
    return this.promotionsRepository.create(createPromotionDto, userId);
  }

  async findAll(branchId?: string): Promise<Promotion[]> {
    return this.promotionsRepository.findAll(branchId);
  }

  async findAllWithSearch(branchId?: string, search?: string): Promise<Promotion[]> {
    return this.promotionsRepository.findAll(branchId, search);
  }

  async findActive(branchId?: string): Promise<Promotion[]> {
    return this.promotionsRepository.findActive(branchId);
  }

  async findOne(id: string): Promise<Promotion> {
    const promotion = await this.promotionsRepository.findById(id);
    if (!promotion) {
      throw new NotFoundException('Promotion not found');
    }
    return promotion;
  }

  async findByCode(code: string): Promise<Promotion> {
    const promotion = await this.promotionsRepository.findByCode(code);
    if (!promotion) {
      throw new NotFoundException('Invalid or expired promotion code');
    }
    return promotion;
  }

  async update(
    id: string,
    updatePromotionDto: UpdatePromotionDto,
  ): Promise<Promotion> {
    const promotion = await this.promotionsRepository.update(
      id,
      updatePromotionDto,
    );
    if (!promotion) {
      throw new NotFoundException('Promotion not found');
    }
    return promotion;
  }

  async remove(id: string): Promise<void> {
    const promotion = await this.promotionsRepository.delete(id);
    if (!promotion) {
      throw new NotFoundException('Promotion not found');
    }
  }

  async toggleStatus(id: string): Promise<Promotion> {
    const promotion = await this.promotionsRepository.toggleStatus(id);
    if (!promotion) {
      throw new NotFoundException('Promotion not found');
    }
    return promotion;
  }

  async calculateDiscount(
    promotionId: string,
    items: CartItem[],
    subtotal: number,
  ): Promise<DiscountResult> {
    const promotion = await this.findOne(promotionId);

    if (!promotion.isActive) {
      throw new BadRequestException('Promotion is not active');
    }

    const now = new Date();
    if (now < promotion.startDate || now > promotion.endDate) {
      throw new BadRequestException('Promotion is not valid at this time');
    }

    if (promotion.usageLimit && promotion.usageCount >= promotion.usageLimit) {
      throw new BadRequestException('Promotion usage limit reached');
    }

    if (promotion.minimumPurchase && subtotal < promotion.minimumPurchase) {
      throw new BadRequestException(
        `Minimum purchase of ${promotion.minimumPurchase} required`,
      );
    }

    let discountAmount = 0;

    if (promotion.scope === PromotionScope.ENTIRE_TRANSACTION) {
      if (promotion.type === PromotionType.PERCENTAGE) {
        discountAmount = (subtotal * promotion.value) / 100;
      } else if (promotion.type === PromotionType.FIXED_AMOUNT) {
        discountAmount = promotion.value;
      }
    } else if (promotion.scope === PromotionScope.SPECIFIC_ITEM) {
      const applicableProductIds =
        promotion.applicableProducts?.map((id) => id.toString()) || [];

      for (const item of items) {
        if (applicableProductIds.includes(item.productId)) {
          const itemTotal = item.unitPrice * item.quantity;
          if (promotion.type === PromotionType.PERCENTAGE) {
            discountAmount += (itemTotal * promotion.value) / 100;
          } else if (promotion.type === PromotionType.FIXED_AMOUNT) {
            discountAmount += promotion.value * item.quantity;
          }
        }
      }
    } else if (promotion.scope === PromotionScope.CATEGORY) {
      const applicableCategories = promotion.applicableCategories || [];

      for (const item of items) {
        if (item.category && applicableCategories.includes(item.category)) {
          const itemTotal = item.unitPrice * item.quantity;
          if (promotion.type === PromotionType.PERCENTAGE) {
            discountAmount += (itemTotal * promotion.value) / 100;
          } else if (promotion.type === PromotionType.FIXED_AMOUNT) {
            discountAmount += promotion.value * item.quantity;
          }
        }
      }
    }

    // Apply maximum discount cap if set
    if (
      promotion.maximumDiscount &&
      discountAmount > promotion.maximumDiscount
    ) {
      discountAmount = promotion.maximumDiscount;
    }

    // Don't allow discount to exceed subtotal
    discountAmount = Math.min(discountAmount, subtotal);

    return {
      promotionId: promotion._id.toString(),
      promotionName: promotion.name,
      discountAmount,
      appliedTo:
        promotion.scope === PromotionScope.ENTIRE_TRANSACTION
          ? 'transaction'
          : 'item',
    };
  }

  async applyPromotion(promotionId: string): Promise<void> {
    await this.promotionsRepository.incrementUsage(promotionId);
  }
}
