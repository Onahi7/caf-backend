import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { Model } from 'mongoose';
import { getModelToken } from '@nestjs/mongoose';
import { User, UserRole } from '../users/schemas/user.schema';
import { Branch } from '../branches/schemas/branch.schema';
import { Product } from '../products/schemas/product.schema';
import { Supplier } from '../suppliers/schemas/supplier.schema';
import { Batch } from '../batches/schemas/batch.schema';
import { Customer } from '../customers/schemas/customer.schema';
import * as bcrypt from 'bcrypt';

async function bootstrap() {
  console.log('🌱 Starting database seeding...\n');

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

    // Clear existing data
    console.log('🗑️  Clearing existing data...');
    await Promise.all([
      userModel.deleteMany({}),
      branchModel.deleteMany({}),
      productModel.deleteMany({}),
      supplierModel.deleteMany({}),
      batchModel.deleteMany({}),
      customerModel.deleteMany({}),
    ]);
    console.log('✅ Data cleared\n');

    // Hash password once for all users
    const password = 'Admin@2025';
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Create branches (HQ only)
    console.log('🏢 Creating branch...');
    const headquarters = await branchModel.create({
      name: 'Headquarters',
      code: 'HQ',
      address: '123 Main Street, Lagos',
      phone: '+234-800-000-0001',
      email: 'hq@pharmacy.com',
      isHeadquarters: true,
      config: {
        reorderThreshold: 10,
        expiryAlertDays: [30, 60, 90],
        allowNegativeStock: false,
      },
      isActive: true,
    });

    console.log(`✅ Created ${await branchModel.countDocuments()} branch (HQ only)\n`);

    // Create users (HQ only)
    console.log('👥 Creating users...');
    const users = [
      {
        username: 'superadmin',
        email: 'superadmin@pharmacy.com',
        passwordHash,
        firstName: 'Super',
        lastName: 'Admin',
        role: UserRole.SUPER_ADMIN,
        branchId: headquarters._id,
        isActive: true,
      },
      {
        username: 'hq_manager',
        email: 'hq.manager@pharmacy.com',
        passwordHash,
        firstName: 'John',
        lastName: 'Manager',
        role: UserRole.BRANCH_MANAGER,
        branchId: headquarters._id,
        isActive: true,
      },
      {
        username: 'pharmacist1',
        email: 'pharmacist1@pharmacy.com',
        passwordHash,
        firstName: 'Sarah',
        lastName: 'Williams',
        role: UserRole.PHARMACIST,
        branchId: headquarters._id,
        isActive: true,
      },
      {
        username: 'cashier1',
        email: 'cashier1@pharmacy.com',
        passwordHash,
        firstName: 'Emma',
        lastName: 'Davis',
        role: UserRole.CASHIER,
        branchId: headquarters._id,
        isActive: true,
      },
      {
        username: 'auditor',
        email: 'auditor@pharmacy.com',
        passwordHash,
        firstName: 'Robert',
        lastName: 'Anderson',
        role: UserRole.AUDITOR,
        branchId: headquarters._id,
        isActive: true,
      },
    ];

    await userModel.insertMany(users);
    console.log(`✅ Created ${users.length} users (HQ only)\n`);

    // Skip suppliers - will be added manually
    console.log('⏭️  Skipping suppliers (add manually as needed)\n');

    // Skip products - will be added manually
    console.log('⏭️  Skipping products (add manually as needed)\n');

    // Skip batches - will be added manually
    console.log('⏭️  Skipping batches (add manually as needed)\n');

    // Skip customers - will be added manually
    console.log('⏭️  Skipping customers (add manually as needed)\n');

    // Display credentials
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎉 DATABASE SEEDING COMPLETED!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('📊 SUMMARY:');
    console.log(`   • ${await branchModel.countDocuments()} Branch (HQ only)`);
    console.log(`   • ${await userModel.countDocuments()} Users (HQ staff only)`);
    console.log(`   • ${await supplierModel.countDocuments()} Suppliers (add manually)`);
    console.log(`   • ${await productModel.countDocuments()} Products (add manually)`);
    console.log(`   • ${await batchModel.countDocuments()} Batches (add manually)`);
    console.log(`   • ${await customerModel.countDocuments()} Customers (add manually)\n`);

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔐 LOGIN CREDENTIALS (Password: Admin@2025)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('👑 SUPER ADMIN:');
    console.log('   Username: superadmin');
    console.log('   Email:    superadmin@pharmacy.com');
    console.log('   Password: Admin@2025\n');

    console.log('👔 BRANCH MANAGER:');
    console.log('   Username: hq_manager      | Branch: Headquarters\n');

    console.log('💊 PHARMACIST:');
    console.log('   Username: pharmacist1     | Branch: Headquarters\n');

    console.log('💰 CASHIER (POS Access):');
    console.log('   Username: cashier1        | Branch: Headquarters\n');

    console.log('📊 AUDITOR:');
    console.log('   Username: auditor');
    console.log('   Email:    auditor@pharmacy.com\n');

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Clean database with HQ branch and users only!');
    console.log('📝 Next steps:');
    console.log('   1. Add suppliers via Admin Panel');
    console.log('   2. Add products via Admin Panel');
    console.log('   3. Add batches when stock arrives');
    console.log('   4. Create outlet branches as needed');
    console.log('   5. Transfer stock to outlets');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  } catch (error) {
    console.error('❌ Error during seeding:', error);
    process.exit(1);
  } finally {
    await app.close();
  }
}

bootstrap();
