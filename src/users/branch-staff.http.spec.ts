import {
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { model, Types } from 'mongoose';
import request from 'supertest';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UsersRepository } from './users.repository';
import { UserRole, UserSchema } from './schemas/user.schema';
import { BranchesController } from '../branches/branches.controller';
import { BranchesService } from '../branches/branches.service';
import { BranchesRepository } from '../branches/branches.repository';
import { Branch } from '../branches/schemas/branch.schema';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

describe('Branch/staff HTTP contracts (isolated persistence)', () => {
  let app: INestApplication;
  const branchId = new Types.ObjectId().toString();
  const otherBranchId = new Types.ObjectId().toString();
  const staffId = new Types.ObjectId().toString();
  const User = model('HttpStaffTest', UserSchema);
  const staff = () =>
    new User({
      _id: staffId,
      username: 'staff',
      email: 'staff@example.com',
      firstName: 'A',
      lastName: 'B',
      role: UserRole.CASHIER,
      branchId: otherBranchId,
      passwordHash: 'secret',
    });
  const branchRepo = {
    create: jest.fn(async (data) => ({ ...data, _id: branchId })),
    findByCode: jest.fn(async () => null),
    findHeadquarters: jest.fn(async () => null),
    update: jest.fn(async (_id, data) => data),
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [UsersController, BranchesController],
      providers: [
        UsersService,
        BranchesService,
        { provide: EventEmitter2, useValue: new EventEmitter2() },
        { provide: BranchesRepository, useValue: branchRepo },
        {
          provide: UsersRepository,
          useValue: {
            create: jest.fn(async () => staff()),
            findById: jest.fn(async () => staff()),
            findByUsername: jest.fn(async () => null),
            findByEmail: jest.fn(async () => null),
            findAll: jest.fn(async () => ({ data: [staff()], total: 1 })),
            findByBranch: jest.fn(async () => [staff()]),
          },
        },
        {
          provide: getModelToken(Branch.name),
          useValue: {
            findById: () => ({
              select() {
                return this;
              },
              lean: async () => ({ isActive: true, isHeadquarters: false }),
            }),
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate(context: ExecutionContext) {
          const req = context.switchToHttp().getRequest();
          if (!req.headers['x-test-role']) throw new UnauthorizedException();
          req.user = {
            userId: 'actor',
            username: 'actor',
            role: req.headers['x-test-role'],
            branchId,
          };
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });
  const newBranch = {
    name: 'New branch',
    code: 'NEW',
    address: '1 Street',
    phone: '123',
    email: 'branch@example.com',
    config: {
      reorderThreshold: 10,
      expiryAlertDays: [30],
      allowNegativeStock: false,
    },
  };
  it('allows super admins to create a branch with nested settings', async () => {
    await request(app.getHttpServer())
      .post('/api/branches')
      .set('x-test-role', 'super_admin')
      .send(newBranch)
      .expect(201);
  });
  it('rejects branch creation by managers', async () => {
    await request(app.getHttpServer())
      .post('/api/branches')
      .set('x-test-role', 'branch_manager')
      .send(newBranch)
      .expect(403);
  });
  it('rejects cross-branch changes and HQ escalation through HTTP', async () => {
    await request(app.getHttpServer())
      .patch(`/api/branches/${otherBranchId}`)
      .set('x-test-role', 'branch_manager')
      .send({ name: 'changed' })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/api/branches/${branchId}`)
      .set('x-test-role', 'branch_manager')
      .send({ isHeadquarters: true })
      .expect(403);
  });
  it('rejects cross-branch staff reads and deactivation through every controller alias', async () => {
    await request(app.getHttpServer())
      .get(`/api/users/branch/${otherBranchId}`)
      .set('x-test-role', 'branch_manager')
      .expect(403);
    await request(app.getHttpServer())
      .get(`/api/users/${staffId}`)
      .set('x-test-role', 'branch_manager')
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/api/users/${staffId}/deactivate`)
      .set('x-test-role', 'branch_manager')
      .expect(403);
  });
  it('rejects missing/malformed branch assignments through global validation', async () => {
    const data = {
      username: 'new',
      email: 'new@example.com',
      firstName: 'A',
      lastName: 'B',
      role: 'cashier',
      password: 'Valid123!',
    };
    await request(app.getHttpServer())
      .post('/api/users')
      .set('x-test-role', 'super_admin')
      .send(data)
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/users')
      .set('x-test-role', 'super_admin')
      .send({ ...data, branchId: 'bad' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/users')
      .set('x-test-role', 'super_admin')
      .send({ ...data, branchId })
      .expect(201);
  });
  it('removes password hashes from actual list and detail HTTP responses', async () => {
    const list = await request(app.getHttpServer())
      .get('/api/users')
      .set('x-test-role', 'super_admin')
      .expect(200);
    const detail = await request(app.getHttpServer())
      .get(`/api/users/${staffId}`)
      .set('x-test-role', 'super_admin')
      .expect(200);
    expect(list.body.data[0]).not.toHaveProperty('passwordHash');
    expect(detail.body).not.toHaveProperty('passwordHash');
  });
  it('rejects invalid pagination and unauthenticated access', async () => {
    await request(app.getHttpServer())
      .get('/api/users?limit=-1')
      .set('x-test-role', 'super_admin')
      .expect(400);
    await request(app.getHttpServer()).get('/api/users').expect(401);
  });
});
