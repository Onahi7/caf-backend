import { ForbiddenException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BranchesService } from './branches.service';
import { BranchesRepository } from './branches.repository';
import { UserRole } from '../users/schemas/user.schema';

describe('Branch management permissions', () => {
  const manager = {
    userId: 'manager',
    username: 'manager',
    role: UserRole.BRANCH_MANAGER,
    branchId: 'own',
  };
  const admin = { ...manager, role: UserRole.SUPER_ADMIN };
  let repo: {
    update: jest.Mock;
    findById: jest.Mock;
    findByCode: jest.Mock;
    findHeadquarters: jest.Mock;
  };
  let service: BranchesService;
  beforeEach(() => {
    repo = {
      update: jest.fn().mockResolvedValue({}),
      findById: jest.fn().mockResolvedValue({}),
      findByCode: jest.fn().mockResolvedValue(null),
      findHeadquarters: jest.fn().mockResolvedValue(null),
    };
    service = new BranchesService(
      repo as unknown as BranchesRepository,
      new EventEmitter2(),
    );
  });
  it('rejects another branch update before writing', async () => {
    await expect(
      service.update('other', { name: 'changed' }, manager),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repo.update).not.toHaveBeenCalled();
  });
  it('rejects another branch configuration and terminal aliases', async () => {
    await expect(
      service.updateConfiguration('other', { reorderThreshold: 20 }, manager),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.assignTerminal('other', 'terminal', manager),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repo.update).not.toHaveBeenCalled();
  });
  it.each([
    { isHeadquarters: true },
    { isHeadquarters: false },
    { isActive: false },
    { isActive: true },
  ])(
    'protects administrative fields %j on the general update route',
    async (patch) => {
      await expect(
        service.update('own', patch, manager),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(repo.update).not.toHaveBeenCalled();
    },
  );
  it('allows a manager to update their own ordinary configuration', async () => {
    await service.updateConfiguration('own', { reorderThreshold: 20 }, manager);
    expect(repo.update).toHaveBeenCalledWith('own', {
      config: { reorderThreshold: 20 },
    });
  });
  it('preserves super admin management across branches', async () => {
    await service.update('other', { isActive: false }, admin);
    expect(repo.update).toHaveBeenCalledWith('other', { isActive: false });
  });
  it('normalizes route IDs for branch session revocation', async () => {
    const id = 'abcdef0123456789abcdef01';
    const events = new EventEmitter2();
    const emit = jest.spyOn(events, 'emit');
    const subject = new BranchesService(
      repo as unknown as BranchesRepository,
      events,
    );
    await subject.update(id.toUpperCase(), { isActive: false }, admin);
    expect(emit).toHaveBeenCalledWith('branch.access.changed', {
      branchId: id,
    });
  });
  it('does not disconnect staff on ordinary branch detail edits', async () => {
    const events = new EventEmitter2();
    const emit = jest.spyOn(events, 'emit');
    const subject = new BranchesService(
      repo as unknown as BranchesRepository,
      events,
    );
    await subject.update('own', { phone: '123' }, admin);
    expect(emit).not.toHaveBeenCalled();
  });
});
