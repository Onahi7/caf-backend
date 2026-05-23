import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { CurrentUserData } from '../../auth/decorators/current-user.decorator.js';
import { UserRole } from '../../users/schemas/user.schema.js';

/**
 * Enforces branch scoping by role.
 * - SUPER_ADMIN: unrestricted — can request any branchId or none (cross-branch).
 * - Everyone else: if they supply a branchId it must match their assigned branch;
 *   if they omit it their own branchId is used automatically.
 *
 * @throws ForbiddenException if a non-admin user requests a branch they are not assigned to.
 */
export function resolveBranchId(
  user: CurrentUserData,
  requestedBranchId?: string,
): string | undefined {
  if (user.role === UserRole.SUPER_ADMIN) {
    return requestedBranchId; // unrestricted
  }

  if (!user.branchId) {
    throw new ForbiddenException(
      'Your account is not assigned to a branch. Contact an administrator.',
    );
  }

  if (requestedBranchId && requestedBranchId !== String(user.branchId)) {
    throw new ForbiddenException(
      'You can only access data for your own branch.',
    );
  }

  return String(user.branchId);
}

export function requireResolvedBranchId(
  user: CurrentUserData,
  requestedBranchId?: string,
  message = 'branchId is required',
): string {
  const resolvedBranchId = resolveBranchId(user, requestedBranchId);
  if (!resolvedBranchId) {
    throw new BadRequestException(message);
  }
  return resolvedBranchId;
}

export function assignResolvedBranchId<T extends { branchId?: string }>(
  user: CurrentUserData,
  target: T,
): T {
  const resolvedBranchId = resolveBranchId(user, target.branchId);
  if (resolvedBranchId) {
    target.branchId = resolvedBranchId;
  } else {
    delete target.branchId;
  }
  return target;
}
