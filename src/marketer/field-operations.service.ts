import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { CurrentUserData } from '../auth/decorators/current-user.decorator.js';
import { User, UserRole } from '../users/schemas/user.schema.js';
import {
  CreateFacilityDto,
  CreateFieldVisitDto,
  DailyFieldReportQueryDto,
  FacilityQueryDto,
  FieldVisitQueryDto,
  UpsertDailyFieldReportDto,
} from './dto/field-operations.dto.js';
import {
  Facility,
  FacilityDocument,
  FacilityStatus,
} from './schemas/facility.schema.js';
import {
  DailyFieldReport,
  DailyFieldReportDocument,
} from './schemas/daily-field-report.schema.js';
import { FieldVisit, FieldVisitDocument, FieldVisitCode } from './schemas/field-visit.schema.js';
import { FieldZone, FieldZoneCode } from './schemas/field-zone.schema.js';

@Injectable()
export class FieldOperationsService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(FieldZone.name) private readonly zoneModel: Model<FieldZone>,
    @InjectModel(Facility.name) private readonly facilityModel: Model<FacilityDocument>,
    @InjectModel(FieldVisit.name) private readonly visitModel: Model<FieldVisitDocument>,
    @InjectModel(DailyFieldReport.name)
    private readonly reportModel: Model<DailyFieldReportDocument>,
  ) {}

  async listZones() {
    return this.zoneModel.find({ isActive: true }).sort({ code: 1 }).lean().exec();
  }

  async getFieldSummary(actor: CurrentUserData) {
    const scope = await this.resolveScope(actor);
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const tomorrow = new Date(todayStart);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

    const facilityQuery: Record<string, unknown> = { branchId: scope.branchId };
    const visitQuery: Record<string, unknown> = { branchId: scope.branchId, visitedAt: { $gte: todayStart, $lt: tomorrow } };
    const reportQuery: Record<string, unknown> = { marketerId: scope.userId, reportDate: todayStart };
    if (actor.role === UserRole.MARKETER) {
      facilityQuery.zoneCode = scope.zoneCode;
      facilityQuery.$or = [{ assignedMarketerId: scope.userId }, { assignedMarketerId: { $exists: false } }];
      visitQuery.marketerId = scope.userId;
    }

    const [facilitiesRegistered, visitsToday, report, zone] = await Promise.all([
      this.facilityModel.countDocuments(facilityQuery).exec(),
      this.visitModel.countDocuments(visitQuery).exec(),
      this.reportModel.findOne(reportQuery).select('status _id').lean().exec(),
      scope.zoneCode ? this.zoneModel.findOne({ code: scope.zoneCode }).select('code name').lean().exec() : null,
    ]);

    const productiveCallsToday = actor.role === UserRole.MARKETER
      ? await this.visitModel.countDocuments({ ...visitQuery, visitType: { $ne: FieldVisitCode.DEAD } }).exec()
      : visitsToday;

    return {
      zoneCode: scope.zoneCode,
      zoneName: zone?.name,
      facilitiesRegistered,
      visitsToday,
      productiveCallsToday,
      dailyReportStatus: report?.status || 'not_started',
      latestReportId: report?._id,
      reportDate: todayStart.toISOString().slice(0, 10),
    };
  }

  async listFacilities(query: FacilityQueryDto, actor: CurrentUserData) {
    const scope = await this.resolveScope(actor, query.branchId);
    const filter: Record<string, unknown> = {};
    if (scope.branchId) filter.branchId = scope.branchId;
    if (query.zoneCode) filter.zoneCode = query.zoneCode;
    if (query.status) filter.status = query.status;
    if (query.search) {
      const safeSearch = query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { name: { $regex: safeSearch, $options: 'i' } },
        { neighbourhood: { $regex: safeSearch, $options: 'i' } },
        { inChargeName: { $regex: safeSearch, $options: 'i' } },
      ];
    }
    if (actor.role === UserRole.MARKETER) {
      filter.zoneCode = scope.zoneCode;
      filter.$and = [{ $or: [{ assignedMarketerId: scope.userId }, { assignedMarketerId: { $exists: false } }] }];
    } else if (query.assignedMarketerId) {
      filter.assignedMarketerId = query.assignedMarketerId;
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const [data, total] = await Promise.all([
      this.facilityModel.find(filter).populate('assignedMarketerId', 'firstName lastName username').sort({ nextVisitAt: 1, createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean().exec(),
      this.facilityModel.countDocuments(filter).exec(),
    ]);
    return { data, total, page, limit };
  }

  async createFacility(dto: CreateFacilityDto, actor: CurrentUserData) {
    const scope = await this.resolveScope(actor, dto.branchId, dto.zoneCode);
    const assignedMarketerId = actor.role === UserRole.MARKETER
      ? new Types.ObjectId(actor.userId)
      : dto.assignedMarketerId ? new Types.ObjectId(dto.assignedMarketerId) : undefined;
    if (assignedMarketerId) {
      const marketer = await this.userModel.findOne({ _id: assignedMarketerId, role: UserRole.MARKETER, isActive: true }).select('_id branchId').lean().exec();
      if (!marketer) throw new NotFoundException('Assigned marketer not found');
    }
    const created = await this.facilityModel.create({
      ...dto,
      branchId: new Types.ObjectId(scope.branchId),
      zoneCode: scope.zoneCode,
      assignedMarketerId,
      createdBy: new Types.ObjectId(actor.userId),
      location: dto.location,
    });
    return created;
  }

  async listVisits(query: FieldVisitQueryDto, actor: CurrentUserData) {
    const scope = await this.resolveScope(actor);
    const filter: Record<string, unknown> = { branchId: scope.branchId };
    if (actor.role === UserRole.MARKETER) filter.marketerId = scope.userId;
    else if (query.marketerId) filter.marketerId = query.marketerId;
    if (query.facilityId) filter.facilityId = query.facilityId;
    if (query.visitType) filter.visitType = query.visitType;
    if (query.from || query.to) {
      filter.visitedAt = {
        ...(query.from ? { $gte: new Date(query.from) } : {}),
        ...(query.to ? { $lte: new Date(query.to) } : {}),
      };
    }
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const [data, total] = await Promise.all([
      this.visitModel.find(filter).populate('facilityId', 'name type neighbourhood zoneCode').sort({ visitedAt: -1 }).skip((page - 1) * limit).limit(limit).lean().exec(),
      this.visitModel.countDocuments(filter).exec(),
    ]);
    return { data, total, page, limit };
  }

  async createVisit(dto: CreateFieldVisitDto, actor: CurrentUserData) {
    const scope = await this.resolveScope(actor);
    const facility = await this.facilityModel.findById(dto.facilityId).lean().exec();
    if (!facility) throw new NotFoundException('Facility not found');
    if (facility.branchId.toString() !== scope.branchId) throw new ForbiddenException('Facility is outside your branch scope');
    if (actor.role === UserRole.MARKETER && facility.zoneCode !== scope.zoneCode) {
      throw new ForbiddenException('Visit is outside your assigned zone');
    }
    const visitedAt = dto.visitedAt ? new Date(dto.visitedAt) : new Date();
    const visit = await this.visitModel.create({
      ...dto,
      facilityId: new Types.ObjectId(dto.facilityId),
      marketerId: new Types.ObjectId(actor.role === UserRole.MARKETER ? actor.userId : (facility.assignedMarketerId?.toString() || actor.userId)),
      branchId: new Types.ObjectId(scope.branchId),
      zoneCode: facility.zoneCode,
      visitedAt,
      nextActionDate: dto.nextActionDate ? new Date(dto.nextActionDate) : undefined,
      products: dto.products?.map((line) => ({ ...line, productId: line.productId ? new Types.ObjectId(line.productId) : undefined })) || [],
    });
    await this.facilityModel.updateOne(
      { _id: facility._id },
      {
        $set: {
          lastVisitAt: visitedAt,
          nextVisitAt: dto.nextActionDate ? new Date(dto.nextActionDate) : undefined,
          status: dto.visitType === FieldVisitCode.DEAD ? FacilityStatus.DORMANT : FacilityStatus.ACTIVE,
          updatedBy: new Types.ObjectId(actor.userId),
        },
      },
    ).exec();
    return visit;
  }

  async listDailyReports(query: DailyFieldReportQueryDto, actor: CurrentUserData) {
    const scope = await this.resolveScope(actor);
    const filter: Record<string, unknown> = { branchId: scope.branchId };
    if (actor.role === UserRole.MARKETER) filter.marketerId = scope.userId;
    else if (query.marketerId) filter.marketerId = query.marketerId;
    if (query.from || query.to) {
      filter.reportDate = {
        ...(query.from ? { $gte: this.dateOnly(query.from) } : {}),
        ...(query.to ? { $lte: this.dateOnly(query.to) } : {}),
      };
    }
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const [data, total] = await Promise.all([
      this.reportModel.find(filter).sort({ reportDate: -1 }).skip((page - 1) * limit).limit(limit).lean().exec(),
      this.reportModel.countDocuments(filter).exec(),
    ]);
    return { data, total, page, limit };
  }

  async upsertDailyReport(dto: UpsertDailyFieldReportDto, actor: CurrentUserData) {
    const scope = await this.resolveScope(actor, undefined, dto.zoneCode);
    const reportDate = this.dateOnly(dto.reportDate);
    const existing = await this.reportModel.findOne({ marketerId: actor.userId, reportDate }).select('status').lean().exec();
    if (existing?.status === 'reviewed') throw new BadRequestException('Reviewed reports cannot be edited');
    return this.reportModel.findOneAndUpdate(
      { marketerId: new Types.ObjectId(actor.userId), reportDate },
      {
        $set: {
          ...dto,
          reportDate,
          zoneCode: scope.zoneCode,
          branchId: new Types.ObjectId(scope.branchId),
          stops: dto.stops?.map((stop) => ({ ...stop, cash: stop.cash ?? 0, balance: stop.balance ?? 0, nextDate: stop.nextDate ? new Date(stop.nextDate) : undefined })) || [],
        },
        $setOnInsert: { marketerId: new Types.ObjectId(actor.userId), status: 'draft' },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).exec();
  }

  async submitDailyReport(id: string, actor: CurrentUserData) {
    if (!Types.ObjectId.isValid(id)) throw new BadRequestException('Invalid daily report ID');
    const filter: Record<string, unknown> = { _id: new Types.ObjectId(id) };
    if (actor.role === UserRole.MARKETER) filter.marketerId = new Types.ObjectId(actor.userId);
    const report = await this.reportModel.findOneAndUpdate(filter, { $set: { status: 'submitted', submittedAt: new Date() } }, { new: true }).exec();
    if (!report) throw new NotFoundException('Daily report not found');
    return report;
  }

  private dateOnly(value: string) {
    const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) throw new BadRequestException('Invalid date');
    return date;
  }

  private async resolveScope(actor: CurrentUserData, requestedBranchId?: string, requestedZoneCode?: FieldZoneCode) {
    const user = await this.userModel.findById(actor.userId).select('branchId role fieldZoneCode').lean().exec();
    if (!user) throw new ForbiddenException('User context is invalid');

    let branchId = requestedBranchId || user.branchId?.toString();
    if (actor.role !== UserRole.SUPER_ADMIN) {
      if (!user.branchId) throw new ForbiddenException('Your account is not assigned to a branch');
      if (requestedBranchId && requestedBranchId !== user.branchId.toString()) {
        throw new ForbiddenException('You can only access field records in your branch');
      }
      branchId = user.branchId.toString();
    }
    if (!branchId) throw new BadRequestException('A branch is required for field operations');

    const zoneCode = requestedZoneCode || user.fieldZoneCode;
    if (actor.role === UserRole.MARKETER && user.fieldZoneCode && requestedZoneCode && user.fieldZoneCode !== requestedZoneCode) {
      throw new ForbiddenException('You can only work inside your assigned zone');
    }
    if (actor.role === UserRole.MARKETER && !zoneCode) {
      throw new BadRequestException('Ask an administrator to assign your Freetown zone first');
    }
    if (zoneCode && !Object.values(FieldZoneCode).includes(zoneCode as FieldZoneCode)) {
      throw new BadRequestException('Invalid field zone');
    }
    return { userId: actor.userId, branchId, zoneCode: zoneCode as FieldZoneCode | undefined };
  }
}
