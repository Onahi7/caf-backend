import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { AppModule } from '../app.module';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { Batch } from '../batches/schemas/batch.schema';
import { Branch } from '../branches/schemas/branch.schema';
import { Customer } from '../customers/schemas/customer.schema';
import {
  MovementType,
  StockMovement,
} from '../inventory/schemas/stock-movement.schema';
import {
  MarketerAssignmentStatus,
  MarketerProductAssignment,
} from '../marketer/schemas/marketer-product-assignment.schema';
import { Product } from '../products/schemas/product.schema';
import { Supplier } from '../suppliers/schemas/supplier.schema';
import { User, UserRole } from '../users/schemas/user.schema';

type BranchSeed = Omit<Branch, 'createdAt' | 'updatedAt'>;
type UserSeed = Omit<User, 'comparePassword' | 'createdAt' | 'updatedAt'>;
type SupplierSeed = Omit<Supplier, 'createdAt' | 'updatedAt'>;
type ProductSeed = Omit<Product, 'createdAt' | 'updatedAt'>;
type BatchSeed = Omit<Batch, 'createdAt' | 'updatedAt'>;
type CustomerSeed = {
  firstName: string;
  lastName: string;
  phone?: string;
  email?: string;
  address?: string;
  dateOfBirth?: Date;
  isInsured: boolean;
  insuranceProvider?: string;
  insurancePolicyNumber?: string;
  loyaltyPoints: number;
  isActive: boolean;
  notes?: string;
};

const PASSWORD = 'Admin@2025';
const CLEAR_DATABASE = process.env.SEED_CLEAR_DATABASE === 'true';

const asObjectId = (value: unknown): Types.ObjectId => {
  if (value instanceof Types.ObjectId) {
    return value;
  }

  return new Types.ObjectId(String(value));
};

const byCode = <T extends { code: string }>(items: T[]) =>
  Object.fromEntries(items.map((item) => [item.code, item])) as Record<string, T>;

const byUsername = <T extends { username: string }>(items: T[]) =>
  Object.fromEntries(items.map((item) => [item.username, item])) as Record<string, T>;

const bySku = <T extends { sku: string }>(items: T[]) =>
  Object.fromEntries(items.map((item) => [item.sku, item])) as Record<string, T>;

async function bootstrap() {
  console.log('Starting database seed');
  console.log(
    CLEAR_DATABASE
      ? 'Mode: destructive clear, then seed'
      : 'Mode: idempotent upsert seed',
  );

  const app = await NestFactory.createApplicationContext(AppModule);

  try {
    const userModel = app.get<Model<User>>(getModelToken(User.name));
    const branchModel = app.get<Model<Branch>>(getModelToken(Branch.name));
    const productModel = app.get<Model<Product>>(getModelToken(Product.name));
    const supplierModel = app.get<Model<Supplier>>(
      getModelToken(Supplier.name),
    );
    const batchModel = app.get<Model<Batch>>(getModelToken(Batch.name));
    const customerModel = app.get<Model<Customer>>(
      getModelToken(Customer.name),
    );
    const stockMovementModel = app.get<Model<StockMovement>>(
      getModelToken(StockMovement.name),
    );
    const marketerAssignmentModel = app.get<Model<MarketerProductAssignment>>(
      getModelToken(MarketerProductAssignment.name),
    );

    if (CLEAR_DATABASE) {
      console.log('Clearing seeded collections...');
      await Promise.all([
        marketerAssignmentModel.deleteMany({}),
        stockMovementModel.deleteMany({}),
        batchModel.deleteMany({}),
        productModel.deleteMany({}),
        supplierModel.deleteMany({}),
        customerModel.deleteMany({}),
        userModel.deleteMany({}),
        branchModel.deleteMany({}),
      ]);
    } else {
      await stockMovementModel.deleteMany({
        'metadata.seedKey': /^seed:/,
      });
    }

    const passwordHash = await bcrypt.hash(PASSWORD, 10);

    const branchSeeds: BranchSeed[] = [
      {
        name: 'Headquarters',
        code: 'HQ',
        address: '15 Siaka Stevens Street, Freetown',
        phone: '+232-30-100-001',
        email: 'hq@carefarm.example',
        isHeadquarters: true,
        config: {
          reorderThreshold: 10,
          expiryAlertDays: [30, 60, 90],
          allowNegativeStock: false,
        },
        isActive: true,
      },
      {
        name: 'Aberdeen Outlet',
        code: 'ABDN',
        address: '7 Beach Road, Aberdeen, Freetown',
        phone: '+232-30-100-002',
        email: 'aberdeen@carefarm.example',
        isHeadquarters: false,
        config: {
          reorderThreshold: 8,
          expiryAlertDays: [30, 60, 90],
          allowNegativeStock: false,
        },
        isActive: true,
      },
    ];

    const branches = await Promise.all(
      branchSeeds.map((branch) =>
        branchModel
          .findOneAndUpdate({ code: branch.code }, branch, {
            returnDocument: 'after',
            upsert: true,
            setDefaultsOnInsert: true,
          })
          .lean(),
      ),
    );
    const branchByCode = byCode(branches);
    const hq = branchByCode.HQ;
    const outlet = branchByCode.ABDN;

    const userSeeds: UserSeed[] = [
      {
        username: 'superadmin',
        email: 'superadmin@carefarm.example',
        passwordHash,
        firstName: 'Super',
        lastName: 'Admin',
        role: UserRole.SUPER_ADMIN,
        branchId: asObjectId(hq._id),
        isActive: true,
      },
      {
        username: 'hq_manager',
        email: 'hq.manager@carefarm.example',
        passwordHash,
        firstName: 'John',
        lastName: 'Manager',
        role: UserRole.BRANCH_MANAGER,
        branchId: asObjectId(hq._id),
        isActive: true,
      },
      {
        username: 'outlet_manager',
        email: 'outlet.manager@carefarm.example',
        passwordHash,
        firstName: 'Aminata',
        lastName: 'Conteh',
        role: UserRole.BRANCH_MANAGER,
        branchId: asObjectId(outlet._id),
        isActive: true,
      },
      {
        username: 'pharmacist1',
        email: 'pharmacist1@carefarm.example',
        passwordHash,
        firstName: 'Sarah',
        lastName: 'Williams',
        role: UserRole.PHARMACIST,
        branchId: asObjectId(hq._id),
        isActive: true,
      },
      {
        username: 'cashier1',
        email: 'cashier1@carefarm.example',
        passwordHash,
        firstName: 'Emma',
        lastName: 'Davis',
        role: UserRole.CASHIER,
        branchId: asObjectId(hq._id),
        isActive: true,
      },
      {
        username: 'cashier2',
        email: 'cashier2@carefarm.example',
        passwordHash,
        firstName: 'Mohamed',
        lastName: 'Kamara',
        role: UserRole.CASHIER,
        branchId: asObjectId(outlet._id),
        isActive: true,
      },
      {
        username: 'marketer1',
        email: 'marketer1@carefarm.example',
        passwordHash,
        firstName: 'Mariama',
        lastName: 'Bangura',
        role: UserRole.MARKETER,
        branchId: asObjectId(hq._id),
        isActive: true,
      },
      {
        username: 'auditor',
        email: 'auditor@carefarm.example',
        passwordHash,
        firstName: 'Robert',
        lastName: 'Anderson',
        role: UserRole.AUDITOR,
        branchId: asObjectId(hq._id),
        isActive: true,
      },
    ];

    const users = await Promise.all(
      userSeeds.map((user) =>
        userModel
          .findOneAndUpdate({ username: user.username }, user, {
            returnDocument: 'after',
            upsert: true,
            setDefaultsOnInsert: true,
          })
          .lean(),
      ),
    );
    const userByUsername = byUsername(users);

    const supplierSeeds: SupplierSeed[] = [
      {
        name: 'West Coast Medical Supplies',
        contactPerson: 'Daniel Koroma',
        phone: '+232-76-220-100',
        email: 'orders@westcoastmedical.example',
        address: 'Cline Town, Freetown',
        paymentTerms: 'Net 30',
        isActive: true,
      },
      {
        name: 'MedPharm Distributors',
        contactPerson: 'Fatmata Sesay',
        phone: '+232-77-550-210',
        email: 'sales@medpharm.example',
        address: 'Kissy Road, Freetown',
        paymentTerms: 'Net 14',
        isActive: true,
      },
      {
        name: 'HealthPlus Wholesale',
        contactPerson: 'Ibrahim Jalloh',
        phone: '+232-88-430-990',
        email: 'supply@healthplus.example',
        address: 'Bo Highway, Freetown',
        paymentTerms: 'Cash on delivery',
        isActive: true,
      },
    ];

    const suppliers = await Promise.all(
      supplierSeeds.map((supplier) =>
        supplierModel
          .findOneAndUpdate({ email: supplier.email }, supplier, {
            returnDocument: 'after',
            upsert: true,
            setDefaultsOnInsert: true,
          })
          .lean(),
      ),
    );

    const productTemplates = [
      {
        name: 'Paracetamol 500mg Tablets',
        sku: 'PAR-500-TAB',
        barcode: '899100000001',
        category: 'otc',
        brand: 'CareRelief',
        unit: 'pack',
        reorderLevel: 25,
        maxStockLevel: 500,
        basePrice: 35,
        costPrice: 22,
        suggestedRetailPrice: 40,
        markupPercentage: 45,
        requiresPrescription: false,
        isControlled: false,
      },
      {
        name: 'Amoxicillin 500mg Capsules',
        sku: 'AMX-500-CAP',
        barcode: '899100000002',
        category: 'prescription',
        brand: 'MediCure',
        unit: 'box',
        reorderLevel: 15,
        maxStockLevel: 250,
        basePrice: 95,
        costPrice: 68,
        suggestedRetailPrice: 110,
        markupPercentage: 40,
        requiresPrescription: true,
        isControlled: false,
      },
      {
        name: 'Vitamin C 1000mg Effervescent',
        sku: 'VITC-1000-EFF',
        barcode: '899100000003',
        category: 'vitamins',
        brand: 'VitaBoost',
        unit: 'tube',
        reorderLevel: 12,
        maxStockLevel: 180,
        basePrice: 120,
        costPrice: 82,
        suggestedRetailPrice: 140,
        markupPercentage: 45,
        requiresPrescription: false,
        isControlled: false,
      },
      {
        name: 'Oral Rehydration Salts Sachet',
        sku: 'ORS-SACHET',
        barcode: '899100000004',
        category: 'otc',
        brand: 'HydraCare',
        unit: 'sachet',
        reorderLevel: 40,
        maxStockLevel: 800,
        basePrice: 12,
        costPrice: 7,
        suggestedRetailPrice: 15,
        markupPercentage: 50,
        requiresPrescription: false,
        isControlled: false,
      },
      {
        name: 'Cetirizine 10mg Tablets',
        sku: 'CET-10-TAB',
        barcode: '899100000005',
        category: 'otc',
        brand: 'AllerFree',
        unit: 'strip',
        reorderLevel: 18,
        maxStockLevel: 300,
        basePrice: 28,
        costPrice: 18,
        suggestedRetailPrice: 35,
        markupPercentage: 50,
        requiresPrescription: false,
        isControlled: false,
      },
      {
        name: 'Salbutamol Inhaler 100mcg',
        sku: 'SALB-INH-100',
        barcode: '899100000006',
        category: 'prescription',
        brand: 'BreatheWell',
        unit: 'inhaler',
        reorderLevel: 8,
        maxStockLevel: 100,
        basePrice: 180,
        costPrice: 130,
        suggestedRetailPrice: 210,
        markupPercentage: 35,
        requiresPrescription: true,
        isControlled: false,
      },
    ];

    const productSeeds: ProductSeed[] = [
      ...productTemplates.map((product) => ({
        ...product,
        branchId: asObjectId(hq._id),
        quantityAvailable: 0,
        quantityInitial: 0,
        packSizes: [],
        isActive: true,
      })),
      ...productTemplates.slice(0, 4).map((product) => ({
        ...product,
        sku: `${product.sku}-AB`,
        barcode: `${product.barcode}9`,
        branchId: asObjectId(outlet._id),
        reorderLevel: Math.max(6, Math.floor(product.reorderLevel / 2)),
        maxStockLevel: Math.floor(product.maxStockLevel / 2),
        quantityAvailable: 0,
        quantityInitial: 0,
        packSizes: [],
        isActive: true,
      })),
    ];

    const products = await Promise.all(
      productSeeds.map((product) =>
        productModel
          .findOneAndUpdate(
            { branchId: product.branchId, sku: product.sku },
            product,
            {
              returnDocument: 'after',
              upsert: true,
              setDefaultsOnInsert: true,
            },
          )
          .lean(),
      ),
    );
    const productBySku = bySku(products);

    const expiry = (monthsFromNow: number) => {
      const date = new Date();
      date.setMonth(date.getMonth() + monthsFromNow);
      date.setDate(15);
      return date;
    };

    const batchSeeds: BatchSeed[] = [
      {
        productId: asObjectId(productBySku['PAR-500-TAB']._id),
        branchId: asObjectId(hq._id),
        lotNumber: 'PAR-HQ-2601',
        expiryDate: expiry(18),
        quantityInitial: 260,
        quantityAvailable: 220,
        purchasePrice: 22,
        sellingPrice: 40,
        supplierId: asObjectId(suppliers[0]._id),
        isExpired: false,
        isDepleted: false,
      },
      {
        productId: asObjectId(productBySku['AMX-500-CAP']._id),
        branchId: asObjectId(hq._id),
        lotNumber: 'AMX-HQ-2602',
        expiryDate: expiry(11),
        quantityInitial: 120,
        quantityAvailable: 84,
        purchasePrice: 68,
        sellingPrice: 110,
        supplierId: asObjectId(suppliers[1]._id),
        isExpired: false,
        isDepleted: false,
      },
      {
        productId: asObjectId(productBySku['VITC-1000-EFF']._id),
        branchId: asObjectId(hq._id),
        lotNumber: 'VIT-HQ-2603',
        expiryDate: expiry(20),
        quantityInitial: 90,
        quantityAvailable: 63,
        purchasePrice: 82,
        sellingPrice: 140,
        supplierId: asObjectId(suppliers[2]._id),
        isExpired: false,
        isDepleted: false,
      },
      {
        productId: asObjectId(productBySku['ORS-SACHET']._id),
        branchId: asObjectId(hq._id),
        lotNumber: 'ORS-HQ-2604',
        expiryDate: expiry(9),
        quantityInitial: 500,
        quantityAvailable: 390,
        purchasePrice: 7,
        sellingPrice: 15,
        supplierId: asObjectId(suppliers[0]._id),
        isExpired: false,
        isDepleted: false,
      },
      {
        productId: asObjectId(productBySku['CET-10-TAB']._id),
        branchId: asObjectId(hq._id),
        lotNumber: 'CET-HQ-2605',
        expiryDate: expiry(16),
        quantityInitial: 140,
        quantityAvailable: 28,
        purchasePrice: 18,
        sellingPrice: 35,
        supplierId: asObjectId(suppliers[1]._id),
        isExpired: false,
        isDepleted: false,
      },
      {
        productId: asObjectId(productBySku['SALB-INH-100']._id),
        branchId: asObjectId(hq._id),
        lotNumber: 'SALB-HQ-2606',
        expiryDate: expiry(14),
        quantityInitial: 45,
        quantityAvailable: 7,
        purchasePrice: 130,
        sellingPrice: 210,
        supplierId: asObjectId(suppliers[2]._id),
        isExpired: false,
        isDepleted: false,
      },
      {
        productId: asObjectId(productBySku['PAR-500-TAB-AB']._id),
        branchId: asObjectId(outlet._id),
        lotNumber: 'PAR-AB-2601',
        expiryDate: expiry(18),
        quantityInitial: 120,
        quantityAvailable: 90,
        purchasePrice: 22,
        sellingPrice: 40,
        supplierId: asObjectId(suppliers[0]._id),
        isExpired: false,
        isDepleted: false,
      },
      {
        productId: asObjectId(productBySku['AMX-500-CAP-AB']._id),
        branchId: asObjectId(outlet._id),
        lotNumber: 'AMX-AB-2602',
        expiryDate: expiry(11),
        quantityInitial: 50,
        quantityAvailable: 22,
        purchasePrice: 68,
        sellingPrice: 110,
        supplierId: asObjectId(suppliers[1]._id),
        isExpired: false,
        isDepleted: false,
      },
      {
        productId: asObjectId(productBySku['VITC-1000-EFF-AB']._id),
        branchId: asObjectId(outlet._id),
        lotNumber: 'VIT-AB-2603',
        expiryDate: expiry(20),
        quantityInitial: 40,
        quantityAvailable: 16,
        purchasePrice: 82,
        sellingPrice: 140,
        supplierId: asObjectId(suppliers[2]._id),
        isExpired: false,
        isDepleted: false,
      },
      {
        productId: asObjectId(productBySku['ORS-SACHET-AB']._id),
        branchId: asObjectId(outlet._id),
        lotNumber: 'ORS-AB-2604',
        expiryDate: expiry(9),
        quantityInitial: 240,
        quantityAvailable: 160,
        purchasePrice: 7,
        sellingPrice: 15,
        supplierId: asObjectId(suppliers[0]._id),
        isExpired: false,
        isDepleted: false,
      },
    ];

    const batches = await Promise.all(
      batchSeeds.map((batch) =>
        batchModel
          .findOneAndUpdate(
            {
              branchId: batch.branchId,
              productId: batch.productId,
              lotNumber: batch.lotNumber,
            },
            batch,
            {
              returnDocument: 'after',
              upsert: true,
              setDefaultsOnInsert: true,
            },
          )
          .lean(),
      ),
    );

    await stockMovementModel.insertMany(
      batches.map((batch) => ({
        branchId: asObjectId(batch.branchId),
        productId: asObjectId(batch.productId),
        batchId: asObjectId(batch._id),
        quantity: batch.quantityInitial,
        movementType: MovementType.PURCHASE,
        reason: 'Opening stock seed',
        userId: asObjectId(userByUsername.hq_manager._id),
        timestamp: new Date(),
        metadata: {
          seedKey: `seed:${batch.lotNumber}`,
          lotNumber: batch.lotNumber,
          quantityAvailable: batch.quantityAvailable,
        },
      })),
    );

    const customerSeeds: CustomerSeed[] = [
      {
        firstName: 'Hawa',
        lastName: 'Mansaray',
        phone: '+232-76-301-111',
        email: 'hawa.mansaray@example.com',
        address: 'Lumley, Freetown',
        dateOfBirth: new Date('1987-04-12'),
        isInsured: true,
        insuranceProvider: 'NASSIT Health',
        insurancePolicyNumber: 'NASSIT-HM-1022',
        loyaltyPoints: 180,
        isActive: true,
        notes: 'Prefers SMS receipts.',
      },
      {
        firstName: 'Alimamy',
        lastName: 'Kargbo',
        phone: '+232-77-302-222',
        email: 'alimamy.kargbo@example.com',
        address: 'Aberdeen, Freetown',
        dateOfBirth: new Date('1975-09-20'),
        isInsured: false,
        loyaltyPoints: 65,
        isActive: true,
        notes: 'Regular OTC customer.',
      },
      {
        firstName: 'Isata',
        lastName: 'Sesay',
        phone: '+232-88-303-333',
        email: 'isata.sesay@example.com',
        address: 'Congo Cross, Freetown',
        dateOfBirth: new Date('1992-02-08'),
        isInsured: true,
        insuranceProvider: 'Private Care',
        insurancePolicyNumber: 'PC-778201',
        loyaltyPoints: 240,
        isActive: true,
        notes: 'Requires pharmacist consultation for prescriptions.',
      },
    ];

    await Promise.all(
      customerSeeds.map((customer) =>
        customerModel.findOneAndUpdate({ phone: customer.phone }, customer, {
          returnDocument: 'after',
          upsert: true,
          setDefaultsOnInsert: true,
        }),
      ),
    );

    const assignmentSeeds = [
      {
        branchId: asObjectId(hq._id),
        marketerId: asObjectId(userByUsername.marketer1._id),
        productId: asObjectId(productBySku['PAR-500-TAB']._id),
        assignedQuantity: 40,
        remainingQuantity: 40,
        assignedUnitPrice: 42,
        status: MarketerAssignmentStatus.PENDING,
        isActive: true,
        assignedBy: asObjectId(userByUsername.hq_manager._id),
        notes: 'Community outreach starter stock.',
      },
      {
        branchId: asObjectId(hq._id),
        marketerId: asObjectId(userByUsername.marketer1._id),
        productId: asObjectId(productBySku['VITC-1000-EFF']._id),
        assignedQuantity: 15,
        remainingQuantity: 15,
        assignedUnitPrice: 145,
        status: MarketerAssignmentStatus.ACCEPTED,
        isActive: true,
        reviewedAt: new Date(),
        reviewedBy: asObjectId(userByUsername.hq_manager._id),
        assignedBy: asObjectId(userByUsername.hq_manager._id),
        notes: 'Accepted for Aberdeen field visits.',
      },
    ];

    await Promise.all(
      assignmentSeeds.map((assignment) =>
        marketerAssignmentModel.findOneAndUpdate(
          {
            branchId: assignment.branchId,
            marketerId: assignment.marketerId,
            productId: assignment.productId,
            isActive: true,
          },
          assignment,
          {
            returnDocument: 'after',
            upsert: true,
            setDefaultsOnInsert: true,
          },
        ),
      ),
    );

    console.log('\nSeed complete');
    console.log(`Branches: ${await branchModel.countDocuments()}`);
    console.log(`Users: ${await userModel.countDocuments()}`);
    console.log(`Suppliers: ${await supplierModel.countDocuments()}`);
    console.log(`Products: ${await productModel.countDocuments()}`);
    console.log(`Batches: ${await batchModel.countDocuments()}`);
    console.log(`Customers: ${await customerModel.countDocuments()}`);
    console.log(
      `Marketer assignments: ${await marketerAssignmentModel.countDocuments()}`,
    );
    console.log('\nLogin password for seeded users: Admin@2025');
    console.log(
      'Useful usernames: superadmin, hq_manager, cashier1, marketer1, outlet_manager',
    );
  } catch (error) {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

void bootstrap();
