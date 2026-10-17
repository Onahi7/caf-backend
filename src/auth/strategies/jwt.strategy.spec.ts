import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { UsersService } from '../../users/users.service';
import { JwtStrategy } from './jwt.strategy';

describe('JWT permissions after staff changes', () => {
  const findById = jest.fn();
  const strategy = new JwtStrategy(
    new ConfigService({ JWT_SECRET: 'test-secret' }),
    {
      findById,
      assertActiveAssignment: jest.fn().mockResolvedValue(undefined),
    } as unknown as UsersService,
  );
  it('uses the current role and branch instead of old token permissions', async () => {
    findById.mockResolvedValue({
      username: 'staff',
      role: 'cashier',
      branchId: 'new-branch',
      isActive: true,
    });
    await expect(
      strategy.validate({
        sub: 'user',
        username: 'old',
        role: 'super_admin',
        branchId: 'old-branch',
      }),
    ).resolves.toEqual({
      userId: 'user',
      username: 'staff',
      role: 'cashier',
      branchId: 'new-branch',
    });
  });
  it('does not restore a removed branch from an old token', async () => {
    findById.mockResolvedValue({
      username: 'staff',
      role: 'auditor',
      isActive: true,
    });
    const user = await strategy.validate({
      sub: 'user',
      username: 'staff',
      role: 'cashier',
      branchId: 'old-branch',
    });
    expect(user.branchId).toBeUndefined();
  });
  it('rejects inactive accounts', async () => {
    findById.mockResolvedValue({ isActive: false });
    await expect(
      strategy.validate({ sub: 'user', username: 'staff', role: 'cashier' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
