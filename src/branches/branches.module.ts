import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Branch, BranchSchema } from './schemas/branch.schema.js';
import { BranchesRepository } from './branches.repository.js';
import { BranchesService } from './branches.service.js';
import { BranchesController } from './branches.controller.js';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Branch.name, schema: BranchSchema }]),
  ],
  controllers: [BranchesController],
  providers: [BranchesRepository, BranchesService],
  exports: [BranchesService, BranchesRepository],
})
export class BranchesModule {}
