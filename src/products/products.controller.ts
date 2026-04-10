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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { ProductsService } from './products.service.js';
import { CreateProductDto } from './dto/create-product.dto.js';
import { UpdateProductDto } from './dto/update-product.dto.js';
import { ProductSearchDto } from './dto/product-search.dto.js';
import { ProductDocument } from './schemas/product.schema.js';
import {
  PricingService,
  ProductPricing,
  type BulkPriceUpdateRequest,
} from './pricing.service.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { UserRole } from '../users/schemas/user.schema.js';
import {
  CurrentUser,
  CurrentUserData,
} from '../auth/decorators/current-user.decorator.js';

@Controller('products')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly pricingService: PricingService,
  ) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.PHARMACIST)
  async create(
    @Body() createProductDto: CreateProductDto,
    @CurrentUser() user: CurrentUserData,
  ): Promise<ProductDocument> {
    return this.productsService.create(createProductDto, user.userId);
  }

  @Get()
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.BRANCH_MANAGER,
    UserRole.PHARMACIST,
    UserRole.CASHIER,
    UserRole.AUDITOR,
  )
  async findAll(
    @Query('branchId') branchId?: string,
    @Query('search') search?: string,
    @Query('category') category?: string,
    @Query('barcode') barcode?: string,
  ): Promise<Array<Record<string, unknown>>> {
    return this.productsService.findCatalog(branchId, {
      search,
      category,
      barcode,
    });
  }

  @Get('active')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.BRANCH_MANAGER,
    UserRole.PHARMACIST,
    UserRole.CASHIER,
    UserRole.AUDITOR,
  )
  async findActive(
    @Query('branchId') branchId?: string,
  ): Promise<ProductDocument[]> {
    return this.productsService.findActive(branchId);
  }

  @Get('search')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.BRANCH_MANAGER,
    UserRole.PHARMACIST,
    UserRole.CASHIER,
    UserRole.AUDITOR,
  )
  async search(
    @Query() searchDto: ProductSearchDto,
    @Query('branchId') branchId?: string,
  ): Promise<ProductDocument[]> {
    return this.productsService.search(searchDto, branchId);
  }

  @Get('category/:category')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.BRANCH_MANAGER,
    UserRole.PHARMACIST,
    UserRole.CASHIER,
    UserRole.AUDITOR,
  )
  async findByCategory(
    @Param('category') category: string,
    @Query('branchId') branchId?: string,
  ): Promise<ProductDocument[]> {
    return this.productsService.findByCategory(category, branchId);
  }

  @Get('brand/:brand')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.BRANCH_MANAGER,
    UserRole.PHARMACIST,
    UserRole.CASHIER,
    UserRole.AUDITOR,
  )
  async findByBrand(
    @Param('brand') brand: string,
    @Query('branchId') branchId?: string,
  ): Promise<ProductDocument[]> {
    return this.productsService.findByBrand(brand, branchId);
  }

  @Get('sku/:sku')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.BRANCH_MANAGER,
    UserRole.PHARMACIST,
    UserRole.CASHIER,
    UserRole.AUDITOR,
  )
  async findBySku(@Param('sku') sku: string): Promise<ProductDocument> {
    return this.productsService.findBySku(sku);
  }

  @Get('barcode/:barcode')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.BRANCH_MANAGER,
    UserRole.PHARMACIST,
    UserRole.CASHIER,
    UserRole.AUDITOR,
  )
  async findByBarcode(
    @Param('barcode') barcode: string,
  ): Promise<ProductDocument> {
    return this.productsService.findByBarcode(barcode);
  }

  @Get('pricing-analytics')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.AUDITOR)
  async getPricingAnalytics(@Query('branchId') branchId?: string): Promise<{
    averageMarkup: number;
    totalProducts: number;
    productsWithCustomPricing: number;
    averageSellingPrice: number;
    priceRanges: { range: string; count: number }[];
  }> {
    return this.pricingService.getPricingAnalytics(branchId);
  }

  @Get(':id')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.BRANCH_MANAGER,
    UserRole.PHARMACIST,
    UserRole.CASHIER,
    UserRole.AUDITOR,
  )
  async findById(@Param('id') id: string): Promise<ProductDocument> {
    return this.productsService.findById(id);
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.PHARMACIST)
  async update(
    @Param('id') id: string,
    @Body() updateProductDto: UpdateProductDto,
  ): Promise<ProductDocument> {
    return this.productsService.update(id, updateProductDto);
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string): Promise<void> {
    return this.productsService.delete(id);
  }

  @Patch(':id/deactivate')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER)
  async deactivate(@Param('id') id: string): Promise<ProductDocument> {
    return this.productsService.deactivate(id);
  }

  // Pricing Management Endpoints
  @Get(':id/pricing')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.BRANCH_MANAGER,
    UserRole.PHARMACIST,
    UserRole.CASHIER,
  )
  async getProductPricing(
    @Param('id') id: string,
    @Query('branchId') branchId?: string,
  ): Promise<ProductPricing> {
    return this.pricingService.getProductPricing(id, branchId);
  }

  @Patch(':id/pricing')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.PHARMACIST)
  async updateProductPricing(
    @Param('id') id: string,
    @Body()
    pricing: {
      basePrice?: number;
      costPrice?: number;
      suggestedRetailPrice?: number;
      markupPercentage?: number;
    },
  ): Promise<ProductDocument | null> {
    return this.pricingService.updateProductPricing(id, pricing);
  }

  @Post(':id/sync-batch-prices')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.PHARMACIST)
  async synchronizeBatchPrices(
    @Param('id') id: string,
    @Query('branchId') branchId?: string,
  ): Promise<{ updatedBatches: number }> {
    const updatedBatches = await this.pricingService.synchronizeBatchPrices(
      id,
      branchId,
    );
    return { updatedBatches };
  }

  @Post('bulk-price-update')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER)
  async bulkUpdatePricing(
    @Body() request: BulkPriceUpdateRequest,
  ): Promise<{ updatedProducts: number; updatedBatches: number }> {
    return this.pricingService.bulkUpdatePricing(request);
  }
}
