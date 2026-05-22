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
  BadRequestException,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
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
} from '../auth/decorators/current-user.decorator.js';
import type { CurrentUserData } from '../auth/decorators/current-user.decorator.js';
import { resolveBranchId } from '../common/utils/branch-scope.util.js';
import { ProductExcelService } from './product-excel.service.js';
import { RequestAnalysisService } from './request-analysis.service.js';

@Controller('products')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly pricingService: PricingService,
    private readonly productExcelService: ProductExcelService,
    private readonly requestAnalysisService: RequestAnalysisService,
  ) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.PHARMACIST)
  async create(
    @Body() createProductDto: CreateProductDto,
    @CurrentUser() user: CurrentUserData,
  ): Promise<ProductDocument> {
    return this.productsService.create(createProductDto, user.userId);
  }

  @Get('import-template')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.PHARMACIST)
  async downloadImportTemplate(
    @CurrentUser() user: CurrentUserData,
    @Query('branchId') branchId: string | undefined,
    @Res() res: Response,
  ) {
    const resolvedBranchId = resolveBranchId(user, branchId);
    const workbookBuffer = await this.productExcelService.buildImportTemplate({
      resolvedBranchId,
      user,
    });

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename=product-import-template.xlsx',
    );
    return res.send(workbookBuffer);
  }

  @Get('export')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.PHARMACIST)
  async exportProducts(
    @CurrentUser() user: CurrentUserData,
    @Query('branchId') branchId: string | undefined,
    @Res() res: Response,
  ) {
    const resolvedBranchId = resolveBranchId(user, branchId);
    const workbookBuffer = await this.productExcelService.buildExportWorkbook({
      resolvedBranchId,
      user,
    });

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename=products-export.xlsx',
    );
    return res.send(workbookBuffer);
  }

  @Post('import')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.PHARMACIST)
  @UseInterceptors(FileInterceptor('file'))
  async importProducts(
    @CurrentUser() user: CurrentUserData,
    @Query('branchId') branchId: string | undefined,
    @UploadedFile() file: { buffer: Buffer } | undefined,
  ): Promise<{
    createdCount: number;
    failedCount: number;
    errors: Array<{ row: number; productName: string; message: string }>;
  }> {
    if (!file?.buffer) {
      throw new BadRequestException('Excel file is required');
    }

    const resolvedBranchId = resolveBranchId(user, branchId);
    return this.productExcelService.importProductsFromWorkbook({
      fileBuffer: file.buffer,
      resolvedBranchId,
      user,
    });
  }

  @Post('request-analysis')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER)
  @UseInterceptors(FileInterceptor('file'))
  async analyzeRequestedItems(
    @CurrentUser() user: CurrentUserData,
    @Query('branchId') branchId: string | undefined,
    @UploadedFile()
    file:
      | { buffer: Buffer; originalname: string; mimetype?: string }
      | undefined,
  ) {
    if (!file?.buffer) {
      throw new BadRequestException('Upload file is required');
    }

    const resolvedBranchId = resolveBranchId(user, branchId);
    return {
      success: true,
      data: await this.requestAnalysisService.analyzeUpload({
        branchId: resolvedBranchId as string,
        fileBuffer: file.buffer,
        filename: file.originalname,
        mimeType: file.mimetype,
      }),
    };
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
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder: string = 'asc',
  ): Promise<any> {
    const p = parseInt(page, 10);
    const l = parseInt(limit, 10);

    if (barcode) {
      const product = await this.productsService.findByBarcodeForBranch(
        barcode,
        branchId,
      );
      const catalogItems = await this.productsService.attachSellingPriceAndStock(
        product ? [product] : [],
        branchId,
      );
      return {
        success: true,
        data: catalogItems,
        pagination: {
          page: p,
          limit: l,
          total: catalogItems.length,
          pages: 1,
          hasNext: false,
          hasPrev: false,
        },
      };
    }

    const searchDto = {
      query: search || '',
      category,
      brand: undefined,
    };

    const { data, total } = await this.productsService.search(
      searchDto,
      branchId,
      p,
      l,
      sortBy,
      sortOrder,
    );

    return {
      success: true,
      data,
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
  ): Promise<Array<Record<string, unknown>>> {
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
    @Query('query') query: string = '',
    @Query('category') category?: string,
    @Query('brand') brand?: string,
    @Query('branchId') branchId?: string,
  ): Promise<Array<Record<string, unknown>>> {
    const searchDto: ProductSearchDto = {
      query,
      category,
      brand,
    };
    const { data } = await this.productsService.search(searchDto, branchId);
    return data;
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
  ): Promise<Array<Record<string, unknown>>> {
    const products = await this.productsService.findByCategory(category, branchId);
    return this.productsService.attachSellingPriceAndStock(products, branchId);
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
  ): Promise<Array<Record<string, unknown>>> {
    const products = await this.productsService.findByBrand(brand, branchId);
    return this.productsService.attachSellingPriceAndStock(products, branchId);
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
    @CurrentUser() user: CurrentUserData,
  ): Promise<ProductDocument> {
    return this.productsService.update(id, updateProductDto, user.userId);
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
