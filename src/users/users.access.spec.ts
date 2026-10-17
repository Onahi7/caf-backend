import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Types } from 'mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { UsersService } from './users.service';
import { UsersRepository } from './users.repository';
import { UserRole } from './schemas/user.schema';

describe('Staff management access and assignment', () => {
  const branchId = new Types.ObjectId().toString();
  const otherBranchId = new Types.ObjectId().toString();
  const manager = {
    userId: 'manager',
    username: 'manager',
    role: UserRole.BRANCH_MANAGER,
    branchId,
  };
  const admin = { role: UserRole.SUPER_ADMIN };
  let repo: Record<string, jest.Mock>;
  let branches: { findById: jest.Mock };
  let service: UsersService;
  const dto = () => ({
    username: 'staff',
    email: 'staff@example.com',
    password: 'Valid123!',
    firstName: 'A',
    lastName: 'B',
    role: UserRole.CASHIER,
    branchId,
  });
  beforeEach(() => {
    repo = {
      findByUsername: jest.fn().mockResolvedValue(null),
      findByEmail: jest.fn().mockResolvedValue(null),
      findById: jest
        .fn()
        .mockResolvedValue({ role: UserRole.CASHIER, branchId }),
      create: jest.fn().mockImplementation(async (data) => data),
      update: jest.fn().mockImplementation(async (_id, data) => data),
      deactivate: jest.fn().mockResolvedValue({}),
      findAll: jest.fn().mockResolvedValue({ data: [], total: 0 }),
      findByBranch: jest.fn().mockResolvedValue([]),
    };
    const query = {
      select: jest.fn().mockReturnThis(),
      lean: jest
        .fn()
        .mockResolvedValue({ isActive: true, isHeadquarters: false }),
    };
    branches = { findById: jest.fn().mockReturnValue(query) };
    service = new UsersService(
      repo as unknown as UsersRepository,
      branches as never,
      new EventEmitter2(),
    );
  });
  it('requires a branch for operational staff even through the API', async () => {
    await expect(
      service.create({ ...dto(), branchId: undefined }, admin),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.create).not.toHaveBeenCalled();
  });
  it('rejects malformed branch IDs before accessing MongoDB', async () => {
    await expect(
      service.create({ ...dto(), branchId: 'bad' }, admin),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.create).not.toHaveBeenCalled();
  });
  it.each([null, { isActive: false }])(
    'rejects a nonexistent or inactive branch: %j',
    async (branch) => {
      branches.findById().lean.mockResolvedValue(branch);
      await expect(service.create(dto(), admin)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(repo.create).not.toHaveBeenCalled();
    },
  );
  it('preserves super admin assignment to an active branch', async () => {
    await expect(service.create(dto(), admin)).resolves.toMatchObject({
      branchId,
    });
  });
  it('automatically assigns outlet staff to their manager branch', async () => {
    await expect(
      service.create({ ...dto(), branchId: otherBranchId }, manager),
    ).resolves.toMatchObject({ branchId });
  });
  it('prevents outlet managers changing privileged accounts by omitting the role', async () => {
    repo.findById.mockResolvedValue({ role: UserRole.SUPER_ADMIN, branchId });
    await expect(
      service.update('staff', { email: 'new@example.com' }, manager),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repo.update).not.toHaveBeenCalled();
  });
  it('prevents deactivating staff in another branch', async () => {
    repo.findById.mockResolvedValue({
      role: UserRole.CASHIER,
      branchId: otherBranchId,
    });
    await expect(service.deactivate('staff', manager)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(repo.deactivate).not.toHaveBeenCalled();
  });
  it('checks the resulting assignment when role is unchanged', async () => {
    await expect(
      service.update('staff', { branchId: '' }, admin),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it('allows headquarters managers to list staff across branches', async () => {
    branches
      .findById()
      .lean.mockResolvedValue({ isHeadquarters: true, isActive: true });
    await service.findAll(manager);
    expect(repo.findAll).toHaveBeenCalledWith(undefined, undefined, 1, 20);
  });
  it('prevents branchless managers from seeing all staff', async () => {
    await expect(
      service.findAll({ role: UserRole.BRANCH_MANAGER }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repo.findAll).not.toHaveBeenCalled();
  });
  it('rejects cross-branch list and detail aliases', async () => {
    const actor = { ...manager, userId: 'manager', username: 'manager' };
    repo.findById.mockResolvedValue({
      role: UserRole.CASHIER,
      branchId: otherBranchId,
    });
    await expect(
      service.findAll(manager, undefined, 1, 20, otherBranchId),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.findByBranch(otherBranchId, actor),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.findVisibleById('staff', actor),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('also protects existing super admins from headquarters managers', async () => {
    branches
      .findById()
      .lean.mockResolvedValue({ isHeadquarters: true, isActive: true });
    repo.findById.mockResolvedValue({ role: UserRole.SUPER_ADMIN, branchId });
    await expect(
      service.update('staff', { password: 'NewValid123!' }, manager),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.deactivate('staff', {
        ...manager,
        userId: 'manager',
        username: 'manager',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('preserves central roles without branch assignment', async () => {
    await expect(
      service.create(
        { ...dto(), role: UserRole.AUDITOR, branchId: undefined },
        admin,
      ),
    ).resolves.toMatchObject({ role: UserRole.AUDITOR });
  });
  it('permits a valid staff transfer and notifies existing sessions', async () => {
    const emit = jest.spyOn((service as any).events, 'emit');
    await service.update('staff', { branchId: otherBranchId }, admin);
    expect(repo.update).toHaveBeenCalledWith('staff', {
      branchId: otherBranchId,
    });
    expect(emit).toHaveBeenCalledWith('user.access.changed', {
      userId: 'staff',
    });
  });
  it('normalizes uppercase route IDs before revoking sessions', async () => {
    const id = new Types.ObjectId().toString();
    const emit = jest.spyOn((service as any).events, 'emit');
    await service.update(id.toUpperCase(), { isActive: false }, admin);
    expect(emit).toHaveBeenCalledWith('user.access.changed', { userId: id });
  });
  it('keeps ordinary profile edits from disconnecting valid staff', async () => {
    const emit = jest.spyOn((service as any).events, 'emit');
    await service.update('staff', { firstName: 'Updated' }, admin);
    expect(emit).not.toHaveBeenCalled();
  });
  it('preserves branchless auditor read access without granting management rights', async () => {
    const auditor = {
      userId: 'auditor',
      username: 'auditor',
      role: UserRole.AUDITOR,
    };
    await expect(service.findByBranch(otherBranchId, auditor)).resolves.toEqual(
      [],
    );
    await expect(
      service.findVisibleById('staff', auditor),
    ).resolves.toBeDefined();
    await expect(
      service.update('staff', { firstName: 'Changed' }, auditor),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('preserves explicit clearing of an optional branch', async () => {
    repo.findById.mockResolvedValue({ role: UserRole.AUDITOR, branchId });
    await service.update('staff', { branchId: null }, admin);
    expect(repo.update).toHaveBeenCalledWith('staff', { branchId: null });
  });
  it('permits deactivation but rejects reactivation of a missing-branch legacy cashier', async () => {
    repo.findById.mockResolvedValue({ role: UserRole.CASHIER });
    await service.update('staff', { isActive: false }, admin);
    await expect(
      service.update('staff', { isActive: true }, admin),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
