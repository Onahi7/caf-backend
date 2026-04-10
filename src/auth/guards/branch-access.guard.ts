import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { UserRole } from '../../users/schemas/user.schema.js';

@Injectable()
export class BranchAccessGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    // Super admin can access all branches
    if (user.role === UserRole.SUPER_ADMIN) {
      return true;
    }

    // Get branchId from request (could be in params, query, or body)
    const requestedBranchId =
      request.params?.branchId ||
      request.query?.branchId ||
      request.body?.branchId;

    // If no branch is specified in the request, allow (will be handled by business logic)
    if (!requestedBranchId) {
      return true;
    }

    // Branch-specific roles must have a branchId
    if (!user.branchId) {
      throw new ForbiddenException('User does not have a branch assignment');
    }

    // Check if user is trying to access their own branch
    if (user.branchId !== requestedBranchId) {
      throw new ForbiddenException(
        'User does not have permission to access this branch',
      );
    }

    return true;
  }
}
