import { SetMetadata } from '@nestjs/common';
import { AuditAction, AuditResource } from '../../audit/schemas/audit-log.schema.js';

export const AUDIT_METADATA_KEY = 'audit:options';

export interface AuditOptions {
  action: AuditAction;
  resource: AuditResource;
  resourceIdParam?: string;
  description?: string;
  getResourceId?: (req: any) => string | undefined;
  getNewData?: (req: any, response: any) => Record<string, unknown> | undefined;
  getPreviousData?: (req: any) => Record<string, unknown> | undefined;
  getMetadata?: (req: any, response: any) => Record<string, unknown> | undefined;
  getBranchId?: (req: any, response: any) => string | undefined;
}

export const Audit = (options: AuditOptions) => SetMetadata(AUDIT_METADATA_KEY, options);
