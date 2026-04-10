import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { BranchesRepository } from './branches.repository.js';
import { CreateBranchDto, BranchConfigDto } from './dto/create-branch.dto.js';
import { UpdateBranchDto } from './dto/update-branch.dto.js';
import { BranchDocument } from './schemas/branch.schema.js';

@Injectable()
export class BranchesService {
  constructor(private readonly branchesRepository: BranchesRepository) {}

  async create(createBranchDto: CreateBranchDto): Promise<BranchDocument> {
    // Check if branch code already exists
    const existingBranch = await this.branchesRepository.findByCode(
      createBranchDto.code,
    );
    if (existingBranch) {
      throw new ConflictException('Branch code already exists');
    }

    // If this is being set as headquarters, ensure no other HQ exists
    if (createBranchDto.isHeadquarters) {
      const existingHQ = await this.branchesRepository.findHeadquarters();
      if (existingHQ) {
        throw new ConflictException(
          'A headquarters branch already exists. Only one branch can be designated as headquarters.',
        );
      }
    }

    return this.branchesRepository.create(createBranchDto);
  }

  async findAll(): Promise<BranchDocument[]> {
    return this.branchesRepository.findAll();
  }

  async findActive(): Promise<BranchDocument[]> {
    return this.branchesRepository.findActive();
  }

  async findById(id: string): Promise<BranchDocument> {
    const branch = await this.branchesRepository.findById(id);
    if (!branch) {
      throw new NotFoundException(`Branch with ID ${id} not found`);
    }
    return branch;
  }

  async findByCode(code: string): Promise<BranchDocument> {
    const branch = await this.branchesRepository.findByCode(code);
    if (!branch) {
      throw new NotFoundException(`Branch with code ${code} not found`);
    }
    return branch;
  }

  async findHeadquarters(): Promise<BranchDocument> {
    const hq = await this.branchesRepository.findHeadquarters();
    if (!hq) {
      throw new NotFoundException('No headquarters branch found');
    }
    return hq;
  }

  async update(
    id: string,
    updateBranchDto: UpdateBranchDto,
  ): Promise<BranchDocument> {
    // Check if code is being updated and already exists
    if (updateBranchDto.code) {
      const existingBranch = await this.branchesRepository.findByCode(
        updateBranchDto.code,
      );
      if (existingBranch && existingBranch._id.toString() !== id) {
        throw new ConflictException('Branch code already exists');
      }
    }

    // If setting as headquarters, ensure no other HQ exists
    if (updateBranchDto.isHeadquarters) {
      const existingHQ = await this.branchesRepository.findHeadquarters();
      if (existingHQ && existingHQ._id.toString() !== id) {
        throw new ConflictException(
          'A headquarters branch already exists. Only one branch can be designated as headquarters.',
        );
      }
    }

    const branch = await this.branchesRepository.update(id, updateBranchDto);
    if (!branch) {
      throw new NotFoundException(`Branch with ID ${id} not found`);
    }
    return branch;
  }

  async delete(id: string): Promise<void> {
    const branch = await this.branchesRepository.delete(id);
    if (!branch) {
      throw new NotFoundException(`Branch with ID ${id} not found`);
    }
  }

  async deactivate(id: string): Promise<BranchDocument> {
    const branch = await this.branchesRepository.deactivate(id);
    if (!branch) {
      throw new NotFoundException(`Branch with ID ${id} not found`);
    }
    return branch;
  }

  async updateConfiguration(
    id: string,
    config: BranchConfigDto,
  ): Promise<BranchDocument> {
    if (!config) {
      throw new BadRequestException('Configuration data is required');
    }

    const updateDto: UpdateBranchDto = { config };
    const branch = await this.branchesRepository.update(id, updateDto);
    if (!branch) {
      throw new NotFoundException(`Branch with ID ${id} not found`);
    }
    return branch;
  }

  async assignTerminal(
    branchId: string,
    terminalId: string,
  ): Promise<{ branchId: string; terminalId: string }> {
    // Verify branch exists
    const branch = await this.findById(branchId);
    if (!branch) {
      throw new NotFoundException(`Branch with ID ${branchId} not found`);
    }

    // In a real implementation, this would store terminal assignments
    // For now, we return the association
    return {
      branchId,
      terminalId,
    };
  }
}
