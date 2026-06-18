import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../app.module';
import { Batch } from '../batches/schemas/batch.schema';
import { Branch, BranchCurrency } from '../branches/schemas/branch.schema';
import {
  MovementType,
  StockMovement,
} from '../inventory/schemas/stock-movement.schema';
import { Product } from '../products/schemas/product.schema';
import { Supplier } from '../suppliers/schemas/supplier.schema';
import { User, UserRole } from '../users/schemas/user.schema';

type MonroviaItem = {
  line: number;
  name: string;
  openingBalance: number;
  quantitySold: number;
  balanceInStock: number;
  sellingPrice: number;
  amountSold: number;
};

const BRANCH_CODE = 'MON';
const BRANCH_NAME = 'Monrovia';
const MANAGER_USERNAME = 'user-monr0v';
const MANAGER_PASSWORD = process.env.MONROVIA_MANAGER_PASSWORD;
const SUPPLIER_EMAIL = 'monrovia-opening-stock@carefarm.example';
const SOURCE = 'monrovia-may-2026-report-image';
const EXPIRY_DATE = new Date('2027-12-31T00:00:00.000Z');

const items: MonroviaItem[] = [
  { line: 1, name: 'Hepatitis B Test', openingBalance: 3, quantitySold: 0, balanceInStock: 3, sellingPrice: 23.5, amountSold: 0 },
  { line: 2, name: 'Hepatitis B Confirmation Test', openingBalance: 1, quantitySold: 0, balanceInStock: 1, sellingPrice: 35, amountSold: 0 },
  { line: 3, name: 'Hepatitis CV Test', openingBalance: 3, quantitySold: 0, balanceInStock: 3, sellingPrice: 22.5, amountSold: 0 },
  { line: 4, name: 'H. Pylori Test', openingBalance: 18, quantitySold: 0, balanceInStock: 18, sellingPrice: 20, amountSold: 0 },
  { line: 5, name: 'Syphilis Test', openingBalance: 1, quantitySold: 1, balanceInStock: 0, sellingPrice: 22, amountSold: 22 },
  { line: 6, name: 'Typhoid Test', openingBalance: 5, quantitySold: 1, balanceInStock: 4, sellingPrice: 25, amountSold: 25 },
  { line: 7, name: 'Malaria Test', openingBalance: 26, quantitySold: 2, balanceInStock: 24, sellingPrice: 8, amountSold: 16 },
  { line: 8, name: 'PSA Test Strip', openingBalance: 51, quantitySold: 2, balanceInStock: 49, sellingPrice: 25, amountSold: 50 },
  { line: 9, name: 'Pregnancy Test', openingBalance: 11, quantitySold: 0, balanceInStock: 11, sellingPrice: 7, amountSold: 0 },
  { line: 10, name: 'Urine Test Strips', openingBalance: 4, quantitySold: 2, balanceInStock: 2, sellingPrice: 14.5, amountSold: 29 },
  { line: 11, name: 'Isaw Machine', openingBalance: 6, quantitySold: 3, balanceInStock: 3, sellingPrice: 85, amountSold: 255 },
  { line: 12, name: 'Digital Blood Pressure Machine', openingBalance: 6, quantitySold: 1, balanceInStock: 5, sellingPrice: 30, amountSold: 30 },
  { line: 13, name: 'Manual Blood Pressure Machine', openingBalance: 2, quantitySold: 0, balanceInStock: 2, sellingPrice: 22.5, amountSold: 0 },
  { line: 14, name: 'Uric Acid Test', openingBalance: 0, quantitySold: 0, balanceInStock: 0, sellingPrice: 30, amountSold: 0 },
  { line: 15, name: 'Total Cholesterol Test I Saw Test', openingBalance: 27, quantitySold: 3, balanceInStock: 24, sellingPrice: 50, amountSold: 150 },
  { line: 16, name: 'Total Cholesterol Test', openingBalance: 4, quantitySold: 4, balanceInStock: 0, sellingPrice: 20, amountSold: 80 },
  { line: 17, name: 'Hemoglobin Strip', openingBalance: 19, quantitySold: 12, balanceInStock: 7, sellingPrice: 35, amountSold: 420 },
  { line: 18, name: 'I Saw Blood Glucose Test', openingBalance: 5, quantitySold: 1, balanceInStock: 4, sellingPrice: 25, amountSold: 25 },
  { line: 19, name: 'Accu Answer Blood Glucose Test', openingBalance: 1, quantitySold: 0, balanceInStock: 1, sellingPrice: 20, amountSold: 0 },
  { line: 20, name: 'Sickle Cell Test', openingBalance: 3, quantitySold: 0, balanceInStock: 3, sellingPrice: 20, amountSold: 0 },
  { line: 21, name: 'Microscope Cover Glasses', openingBalance: 2, quantitySold: 0, balanceInStock: 2, sellingPrice: 25, amountSold: 0 },
  { line: 22, name: 'Field Stain A', openingBalance: 5, quantitySold: 0, balanceInStock: 5, sellingPrice: 4, amountSold: 0 },
  { line: 23, name: 'Field Stain B', openingBalance: 5, quantitySold: 0, balanceInStock: 5, sellingPrice: 4, amountSold: 0 },
  { line: 24, name: 'Filter Paper', openingBalance: 1, quantitySold: 0, balanceInStock: 1, sellingPrice: 8, amountSold: 0 },
  { line: 25, name: 'Fetal Doppler', openingBalance: 0, quantitySold: 0, balanceInStock: 0, sellingPrice: 80, amountSold: 0 },
  { line: 26, name: 'EDTA Bottle', openingBalance: 2, quantitySold: 0, balanceInStock: 2, sellingPrice: 15, amountSold: 0 },
  { line: 27, name: 'Emulsion Oil', openingBalance: 4, quantitySold: 0, balanceInStock: 4, sellingPrice: 5, amountSold: 0 },
  { line: 28, name: 'Gonorrhea Test', openingBalance: 0, quantitySold: 0, balanceInStock: 0, sellingPrice: 60, amountSold: 0 },
  { line: 29, name: 'Tuberculosis', openingBalance: 37, quantitySold: 1, balanceInStock: 36, sellingPrice: 25, amountSold: 25 },
  { line: 30, name: 'Blood Grouping', openingBalance: 1, quantitySold: 0, balanceInStock: 1, sellingPrice: 25, amountSold: 0 },
  { line: 31, name: 'Widal Reagent', openingBalance: 1, quantitySold: 0, balanceInStock: 1, sellingPrice: 25, amountSold: 0 },
];

const asObjectId = (value: unknown): Types.ObjectId => {
  if (value instanceof Types.ObjectId) {
    return value;
  }

  return new Types.ObjectId(String(value));
};

const money = (value: number) => Math.round(value * 100) / 100;

const slug = (value: string) =>
  value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

async function bootstrap() {
  console.log('Setting up Monrovia branch, manager, and stock');

  if (!MANAGER_PASSWORD) {
    throw new Error('MONROVIA_MANAGER_PASSWORD is required');
  }

  const app = await NestFactory.createApplicationContext(AppModule);

  try {
    const branchModel = app.get<Model<Branch>>(getModelToken(Branch.name));
    const userModel = app.get<Model<User>>(getModelToken(User.name));
    const supplierModel = app.get<Model<Supplier>>(getModelToken(Supplier.name));
    const productModel = app.get<Model<Product>>(getModelToken(Product.name));
    const batchModel = app.get<Model<Batch>>(getModelToken(Batch.name));
    const stockMovementModel = app.get<Model<StockMovement>>(
      getModelToken(StockMovement.name),
    );

    const branch = await branchModel
      .findOneAndUpdate(
        { code: BRANCH_CODE },
        {
          name: BRANCH_NAME,
          code: BRANCH_CODE,
          address: 'Monrovia',
          phone: '+231-000-000-000',
          email: 'monrovia@carefarm.example',
          currencyCode: BranchCurrency.USD,
          isHeadquarters: false,
          config: {
            reorderThreshold: 5,
            expiryAlertDays: [30, 60, 90],
            allowNegativeStock: false,
          },
          isActive: true,
        },
        {
          returnDocument: 'after',
          upsert: true,
          setDefaultsOnInsert: true,
        },
      )
      .lean();

    const passwordHash = await bcrypt.hash(MANAGER_PASSWORD, 10);
    const manager = await userModel
      .findOneAndUpdate(
        { username: MANAGER_USERNAME },
        {
          username: MANAGER_USERNAME,
          email: 'pinkie.monrovia@carefarm.example',
          passwordHash,
          firstName: 'Pinkie',
          lastName: 'Monrovia',
          role: UserRole.BRANCH_MANAGER,
          branchId: asObjectId(branch._id),
          isActive: true,
        },
        {
          returnDocument: 'after',
          upsert: true,
          setDefaultsOnInsert: true,
        },
      )
      .lean();

    const supplier = await supplierModel
      .findOneAndUpdate(
        { email: SUPPLIER_EMAIL },
        {
          name: 'Monrovia Opening Stock',
          contactPerson: 'Pinkie',
          phone: '+231-000-000-000',
          email: SUPPLIER_EMAIL,
          address: 'Monrovia',
          paymentTerms: 'Opening balance import',
          isActive: true,
        },
        {
          returnDocument: 'after',
          upsert: true,
          setDefaultsOnInsert: true,
        },
      )
      .lean();

    const imported: Array<{ sku: string; name: string; stock: number; price: number; cost: number }> = [];

    for (const item of items) {
      const sku = `${BRANCH_CODE}-${String(item.line).padStart(2, '0')}-${slug(item.name)}`;
      const sellingPrice = money(item.sellingPrice);
      const costPrice = money(sellingPrice * 0.85);

      const product = await productModel
        .findOneAndUpdate(
          {
            branchId: asObjectId(branch._id),
            sku,
          },
          {
            branchId: asObjectId(branch._id),
            name: item.name,
            sku,
            barcode: sku,
            category: 'Diagnostics',
            brand: 'Monrovia Opening Stock',
            unit: 'piece',
            reorderLevel: Math.max(1, Math.ceil(item.openingBalance * 0.2)),
            maxStockLevel: Math.max(item.openingBalance, item.balanceInStock, 1),
            quantityAvailable: item.balanceInStock,
            quantityInitial: item.balanceInStock,
            basePrice: sellingPrice,
            costPrice,
            suggestedRetailPrice: sellingPrice,
            markupPercentage: money(((sellingPrice - costPrice) / costPrice) * 100),
            requiresPrescription: false,
            isControlled: false,
            isActive: true,
            supplyDate: new Date('2026-05-31T00:00:00.000Z'),
            expiryDate: EXPIRY_DATE,
            packSizes: [
              {
                code: 'piece',
                name: 'Piece',
                unit: 'piece',
                quantityPerPack: 1,
                sellingPrice,
                barcode: sku,
              },
            ],
          },
          {
            returnDocument: 'after',
            upsert: true,
            setDefaultsOnInsert: true,
          },
        )
        .lean();

      const batch = await batchModel
        .findOneAndUpdate(
          {
            branchId: asObjectId(branch._id),
            productId: asObjectId(product._id),
            lotNumber: `${sku}-OPENING`,
          },
          {
            branchId: asObjectId(branch._id),
            productId: asObjectId(product._id),
            lotNumber: `${sku}-OPENING`,
            expiryDate: EXPIRY_DATE,
            quantityAvailable: item.balanceInStock,
            quantityInitial: item.balanceInStock,
            purchasePrice: costPrice,
            sellingPrice,
            supplierId: asObjectId(supplier._id),
            isExpired: false,
            isDepleted: item.balanceInStock <= 0,
          },
          {
            returnDocument: 'after',
            upsert: true,
            setDefaultsOnInsert: true,
          },
        )
        .lean();

      await stockMovementModel.deleteMany({
        'metadata.seedKey': `monrovia:${sku}`,
      });

      if (item.balanceInStock > 0) {
        await stockMovementModel.create({
          branchId: asObjectId(branch._id),
          productId: asObjectId(product._id),
          batchId: asObjectId(batch._id),
          quantity: item.balanceInStock,
          movementType: MovementType.PURCHASE,
          reason: 'Monrovia opening stock import',
          userId: asObjectId(manager._id),
          timestamp: new Date(),
          metadata: {
            seedKey: `monrovia:${sku}`,
            source: SOURCE,
            lineNumber: item.line,
            openingBalance: item.openingBalance,
            quantitySold: item.quantitySold,
            balanceInStock: item.balanceInStock,
            amountSold: item.amountSold,
            sellingPrice,
            costPrice,
            costRule: '15 percent lower than selling price',
          },
        });
      }

      imported.push({
        sku,
        name: item.name,
        stock: item.balanceInStock,
        price: sellingPrice,
        cost: costPrice,
      });
    }

    const stockTotal = imported.reduce((sum, item) => sum + item.stock, 0);
    const inventoryValue = imported.reduce(
      (sum, item) => sum + item.stock * item.cost,
      0,
    );

    console.log(`Branch: ${branch.name} (${branch.code})`);
    console.log(`Manager username: ${manager.username}`);
    console.log(`Products imported: ${imported.length}`);
    console.log(`Total units in stock: ${stockTotal}`);
    console.log(`Inventory cost value: ${money(inventoryValue)}`);
  } finally {
    await app.close();
  }
}

bootstrap().catch((error) => {
  console.error('Monrovia setup failed:', error);
  process.exit(1);
});
