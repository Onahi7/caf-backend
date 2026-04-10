import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import * as fc from 'fast-check';
import { RolesGuard } from './guards/roles.guard.js';
import { BranchAccessGuard } from './guards/branch-access.guard.js';
import { UserRole } from '../users/schemas/user.schema.js';

/**
 * Property-Based Tests for Role-Based Access Control
 *
 * **Feature: pharmacy-pos-system, Property 36: Role enumeration support**
 * **Feature: pharmacy-pos-system, Property 37: Role-based function access**
 * **Feature: pharmacy-pos-system, Property 38: Super admin universal access**
 * **Feature: pharmacy-pos-system, Property 39: Branch manager scope restriction**
 * **Feature: pharmacy-pos-system, Property 40: Cashier permission restriction**
 *
 * **Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5**
 */
describe('RBAC Property Tests', () => {
  let rolesGuard: RolesGuard;
  let branchAccessGuard: BranchAccessGuard;
  let reflector: Reflector;

  // Arbitraries
  const branchIdArb = fc
    .string({ minLength: 24, maxLength: 24 })
    .filter((s) => /^[0-9a-f]{24}$/.test(s));
  const roleArb = fc.constantFrom(...Object.values(UserRole));

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RolesGuard,
        BranchAccessGuard,
        {
          provide: Reflector,
          useValue: {
            getAllAndOverride: jest.fn(),
          },
        },
      ],
    }).compile();

    rolesGuard = module.get<RolesGuard>(RolesGuard);
    branchAccessGuard = module.get<BranchAccessGuard>(BranchAccessGuard);
    reflector = module.get<Reflector>(Reflector);
  });

  const createMockExecutionContext = (
    user: any,
    _requiredRoles?: UserRole[],
    branchId?: string,
  ): ExecutionContext => {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          user,
          params: branchId ? { branchId } : {},
          query: {},
          body: {},
        }),
      }),
      getHandler: jest.fn(),
      getClass: jest.fn(),
    } as any;
  };

  describe('Property 36: Role enumeration support', () => {
    it('should accept all valid UserRole values', async () => {
      await fc.assert(
        fc.asyncProperty(roleArb, branchIdArb, async (role, branchId) => {
          const user = {
            userId: '507f1f77bcf86cd799439011',
            username: 'testuser',
            role,
            branchId: role !== UserRole.SUPER_ADMIN ? branchId : undefined,
          };

          // No required roles means access is granted
          jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

          const context = createMockExecutionContext(user);
          const result = rolesGuard.canActivate(context);

          // Property: All valid roles should be accepted
          expect(result).toBe(true);
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('Property 37: Role-based function access', () => {
    it('should grant access only when user role matches required roles', async () => {
      await fc.assert(
        fc.asyncProperty(
          roleArb,
          fc.array(roleArb, { minLength: 1, maxLength: 3 }),
          branchIdArb,
          async (userRole, requiredRoles, branchId) => {
            const user = {
              userId: '507f1f77bcf86cd799439011',
              username: 'testuser',
              role: userRole,
              branchId:
                userRole !== UserRole.SUPER_ADMIN ? branchId : undefined,
            };

            jest
              .spyOn(reflector, 'getAllAndOverride')
              .mockReturnValue(requiredRoles);

            const context = createMockExecutionContext(user);

            // Property: Access granted if user role is in required roles OR user is super admin
            const shouldHaveAccess =
              userRole === UserRole.SUPER_ADMIN ||
              requiredRoles.includes(userRole);

            if (shouldHaveAccess) {
              const result = rolesGuard.canActivate(context);
              expect(result).toBe(true);
            } else {
              expect(() => rolesGuard.canActivate(context)).toThrow(
                ForbiddenException,
              );
            }
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('Property 38: Super admin universal access', () => {
    it('should grant super admin access to all functions regardless of required roles', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(roleArb, { minLength: 1, maxLength: 5 }),
          async (requiredRoles) => {
            const superAdminUser = {
              userId: '507f1f77bcf86cd799439011',
              username: 'superadmin',
              role: UserRole.SUPER_ADMIN,
            };

            jest
              .spyOn(reflector, 'getAllAndOverride')
              .mockReturnValue(requiredRoles);

            const context = createMockExecutionContext(superAdminUser);
            const result = rolesGuard.canActivate(context);

            // Property: Super admin always has access
            expect(result).toBe(true);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('should grant super admin access to all branches', async () => {
      await fc.assert(
        fc.asyncProperty(branchIdArb, async (requestedBranchId) => {
          const superAdminUser = {
            userId: '507f1f77bcf86cd799439011',
            username: 'superadmin',
            role: UserRole.SUPER_ADMIN,
          };

          const context = createMockExecutionContext(
            superAdminUser,
            undefined,
            requestedBranchId,
          );
          const result = branchAccessGuard.canActivate(context);

          // Property: Super admin can access any branch
          expect(result).toBe(true);
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('Property 39: Branch manager scope restriction', () => {
    it('should restrict branch manager to their assigned branch only', async () => {
      await fc.assert(
        fc.asyncProperty(
          branchIdArb,
          branchIdArb,
          async (userBranchId, requestedBranchId) => {
            const branchManagerUser = {
              userId: '507f1f77bcf86cd799439011',
              username: 'branchmanager',
              role: UserRole.BRANCH_MANAGER,
              branchId: userBranchId,
            };

            const context = createMockExecutionContext(
              branchManagerUser,
              undefined,
              requestedBranchId,
            );

            // Property: Access granted only if requested branch matches user's branch
            if (userBranchId === requestedBranchId) {
              const result = branchAccessGuard.canActivate(context);
              expect(result).toBe(true);
            } else {
              expect(() => branchAccessGuard.canActivate(context)).toThrow(
                ForbiddenException,
              );
            }
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('Property 40: Cashier permission restriction', () => {
    it('should deny cashier access to inventory adjustment functions', async () => {
      await fc.assert(
        fc.asyncProperty(branchIdArb, async (branchId) => {
          const cashierUser = {
            userId: '507f1f77bcf86cd799439011',
            username: 'cashier',
            role: UserRole.CASHIER,
            branchId,
          };

          // Simulate inventory adjustment endpoint requiring BRANCH_MANAGER or PHARMACIST
          const requiredRoles = [UserRole.BRANCH_MANAGER, UserRole.PHARMACIST];
          jest
            .spyOn(reflector, 'getAllAndOverride')
            .mockReturnValue(requiredRoles);

          const context = createMockExecutionContext(cashierUser);

          // Property: Cashier should be denied access
          expect(() => rolesGuard.canActivate(context)).toThrow(
            ForbiddenException,
          );
        }),
        { numRuns: 100 },
      );
    });

    it('should allow cashier access to POS functions', async () => {
      await fc.assert(
        fc.asyncProperty(branchIdArb, async (branchId) => {
          const cashierUser = {
            userId: '507f1f77bcf86cd799439011',
            username: 'cashier',
            role: UserRole.CASHIER,
            branchId,
          };

          // Simulate POS endpoint requiring CASHIER, PHARMACIST, or BRANCH_MANAGER
          const requiredRoles = [
            UserRole.CASHIER,
            UserRole.PHARMACIST,
            UserRole.BRANCH_MANAGER,
          ];
          jest
            .spyOn(reflector, 'getAllAndOverride')
            .mockReturnValue(requiredRoles);

          const context = createMockExecutionContext(cashierUser);
          const result = rolesGuard.canActivate(context);

          // Property: Cashier should have access to POS functions
          expect(result).toBe(true);
        }),
        { numRuns: 100 },
      );
    });
  });
});
