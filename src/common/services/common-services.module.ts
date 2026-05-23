import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Product, ProductSchema } from '../../products/schemas/product.schema.js';
import { CloudStorageService } from './cloud-storage.service.js';
import { DocumentProcessorService } from './document-processor.service.js';
import { ProductMatcherService } from './product-matcher.service.js';
import { PdfGeneratorService } from './pdf-generator.service.js';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Product.name, schema: ProductSchema }]),
  ],
  providers: [
    CloudStorageService,
    DocumentProcessorService,
    ProductMatcherService,
    PdfGeneratorService,
  ],
  exports: [
    CloudStorageService,
    DocumentProcessorService,
    ProductMatcherService,
    PdfGeneratorService,
  ],
})
export class CommonServicesModule {}
