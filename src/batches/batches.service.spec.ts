import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BatchesService } from './batches.service.js';
import { BatchesRepository } from './batches.repository.js';
import { BatchDocument } from './schemas/batch.schema.js';
import { EventsService } from '../websocket/events.service.js';
import { Types } from 'mongoose';

describe('BatchesService', () => {
  let service: BatchesService;

  const mockBatchesRepository = {
    create: jest.fn(),
    findById: jest.fn(),
    findAvailableForFEFO: jest.fn(),
    findByBranch: jest.fn(),
    findByProduct: jest.fn(),
    findByBranchAndProduct: jest.fn(),
    update: jest.fn(),
    updateQuantity: jest.fn(),
    markAsExpired: jest.fn(),
    delete: jest.fn(),
  };

  const mockEventsService = {
    emitBatchUpdate: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BatchesService,
        {
          provide: BatchesRepository,
          useValue: mockBatchesRepository,
        },
        {
          provide: EventsService,
          useValue: mockEventsService,
        },
      ],
    }).compile();

    service = module.get<BatchesService>(BatchesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('selectBatchesForSale - FEFO Logic', () => {
    it('should select batch with earliest expiry date first', async () => {
      const branchId = new Types.ObjectId().toString();
      const productId = new Types.ObjectId().toString();

      const mockBatches = [
        {
          _id: new Types.ObjectId(),
          productId: new Types.ObjectId(productId),
          branchId: new Types.ObjectId(branchId),
          lotNumber: 'LOT001',
          expiryDate: new Date('2025-03-01'),
          quantityAvailable: 50,
          sellingPrice: 100,
        },
        {
          _id: new Types.ObjectId(),
          productId: new Types.ObjectId(productId),
          branchId: new Types.ObjectId(branchId),
          lotNumber: 'LOT002',
          expiryDate: new Date('2025-06-01'),
          quantityAvailable: 100,
          sellingPrice: 100,
        },
      ] as BatchDocument[];

      mockBatchesRepository.findAvailableForFEFO.mockResolvedValue(mockBatches);

      const result = await service.selectBatchesForSale({
        branchId,
        productId,
        quantityNeeded: 30,
      });

      expect(result).toHaveLength(1);
      expect(result[0].batchId).toBe(mockBatches[0]._id.toString());
      expect(result[0].quantity).toBe(30);
      expect(result[0].lotNumber).toBe('LOT001');
    });

    it('should select multiple batches when quantity exceeds first batch', async () => {
      const branchId = new Types.ObjectId().toString();
      const productId = new Types.ObjectId().toString();

      const mockBatches = [
        {
          _id: new Types.ObjectId(),
          productId: new Types.ObjectId(productId),
          branchId: new Types.ObjectId(branchId),
          lotNumber: 'LOT001',
          expiryDate: new Date('2025-03-01'),
          quantityAvailable: 50,
          sellingPrice: 100,
        },
        {
          _id: new Types.ObjectId(),
          productId: new Types.ObjectId(productId),
          branchId: new Types.ObjectId(branchId),
          lotNumber: 'LOT002',
          expiryDate: new Date('2025-06-01'),
          quantityAvailable: 100,
          sellingPrice: 100,
        },
      ] as BatchDocument[];

      mockBatchesRepository.findAvailableForFEFO.mockResolvedValue(mockBatches);

      const result = await service.selectBatchesForSale({
        branchId,
        productId,
        quantityNeeded: 80,
      });

      expect(result).toHaveLength(2);
      expect(result[0].batchId).toBe(mockBatches[0]._id.toString());
      expect(result[0].quantity).toBe(50);
      expect(result[1].batchId).toBe(mockBatches[1]._id.toString());
      expect(result[1].quantity).toBe(30);
    });

    it('should throw error when insufficient stock', async () => {
      const branchId = new Types.ObjectId().toString();
      const productId = new Types.ObjectId().toString();

      const mockBatches = [
        {
          _id: new Types.ObjectId(),
          productId: new Types.ObjectId(productId),
          branchId: new Types.ObjectId(branchId),
          lotNumber: 'LOT001',
          expiryDate: new Date('2025-03-01'),
          quantityAvailable: 50,
          sellingPrice: 100,
        },
      ] as BatchDocument[];

      mockBatchesRepository.findAvailableForFEFO.mockResolvedValue(mockBatches);

      await expect(
        service.selectBatchesForSale({
          branchId,
          productId,
          quantityNeeded: 100,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw error when no batches available', async () => {
      const branchId = new Types.ObjectId().toString();
      const productId = new Types.ObjectId().toString();

      mockBatchesRepository.findAvailableForFEFO.mockResolvedValue([]);

      await expect(
        service.selectBatchesForSale({
          branchId,
          productId,
          quantityNeeded: 10,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should exclude expired batches (handled by repository)', async () => {
      const branchId = new Types.ObjectId().toString();
      const productId = new Types.ObjectId().toString();

      // Repository should only return non-expired batches
      const mockBatches = [
        {
          _id: new Types.ObjectId(),
          productId: new Types.ObjectId(productId),
          branchId: new Types.ObjectId(branchId),
          lotNumber: 'LOT002',
          expiryDate: new Date('2025-06-01'),
          quantityAvailable: 100,
          sellingPrice: 100,
        },
      ] as BatchDocument[];

      mockBatchesRepository.findAvailableForFEFO.mockResolvedValue(mockBatches);

      const result = await service.selectBatchesForSale({
        branchId,
        productId,
        quantityNeeded: 50,
      });

      expect(result).toHaveLength(1);
      expect(result[0].lotNumber).toBe('LOT002');
    });
  });

  describe('create', () => {
    it('should throw error when required fields are missing', async () => {
      const invalidDto: any = {
        productId: new Types.ObjectId().toString(),
        // Missing other required fields
      };

      await expect(service.create(invalidDto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('findById', () => {
    it('should throw NotFoundException when batch not found', async () => {
      mockBatchesRepository.findById.mockResolvedValue(null);

      await expect(service.findById('invalid-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
