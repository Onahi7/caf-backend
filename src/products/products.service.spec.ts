import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { AuditService } from '../audit/audit.service.js';
import { UsersService } from '../users/users.service.js';
import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductsRepository } from './products.repository';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

describe('ProductsService', () => {
  let service: ProductsService;

  const mockProduct = {
    _id: '507f1f77bcf86cd799439011',
    branchId: '507f1f77bcf86cd799439012',
    quantityAvailable: 0,
    basePrice: 0,
    suggestedRetailPrice: 0,
    toObject() { const { toObject, ...plain } = this; return plain; },
    name: 'Paracetamol 500mg',
    sku: 'PARA-500',
    barcode: '1234567890123',
    category: 'Pain Relief',
    brand: 'Generic',
    unit: 'Tablet',
    reorderLevel: 100,
    requiresPrescription: false,
    isControlled: false,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockRepository = {
    create: jest.fn(),
    findAll: jest.fn(),
    findActive: jest.fn(),
    findById: jest.fn(),
    findBySku: jest.fn(),
    findBySkuAndBranch: jest.fn(),
    findByBarcodeAndBranch: jest.fn(),
    findByBarcode: jest.fn(),
    findByName: jest.fn(),
    search: jest.fn(),
    findByCategory: jest.fn(),
    findByBrand: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    deactivate: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: AuditService, useValue: { logCreate: jest.fn() } },
        { provide: UsersService, useValue: {} },
        { provide: getConnectionToken(), useValue: {} },
        { provide: getModelToken('Batch'), useValue: {} },
        { provide: getModelToken('StockMovement'), useValue: {} },
        {
          provide: ProductsRepository,
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<ProductsService>(ProductsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a product successfully', async () => {
      const createDto: CreateProductDto = {
        name: 'Paracetamol 500mg',
        sku: 'PARA-500',
        barcode: '1234567890123',
        category: 'Pain Relief',
        brand: 'Generic',
        unit: 'Tablet',
        reorderLevel: 100,
      };

      mockRepository.findBySkuAndBranch.mockResolvedValue(null);
      mockRepository.findByBarcodeAndBranch.mockResolvedValue(null);
      mockRepository.create.mockResolvedValue(mockProduct);

      const result = await service.create(createDto);

      expect(result).toEqual(mockProduct);
      expect(mockRepository.findBySkuAndBranch).toHaveBeenCalledWith(createDto.sku, createDto.branchId);
      expect(mockRepository.findByBarcodeAndBranch).toHaveBeenCalledWith(
        createDto.barcode, createDto.branchId,
      );
      expect(mockRepository.create).toHaveBeenCalledWith(expect.objectContaining({ name: createDto.name, sku: createDto.sku, barcode: createDto.barcode, quantityAvailable: 0, quantityInitial: 0 }));
    });

    it('should throw ConflictException if SKU already exists', async () => {
      const createDto: CreateProductDto = {
        name: 'Paracetamol 500mg',
        sku: 'PARA-500',
        barcode: '1234567890123',
        category: 'Pain Relief',
        brand: 'Generic',
        unit: 'Tablet',
        reorderLevel: 100,
      };

      mockRepository.findBySkuAndBranch.mockResolvedValue(mockProduct);

      await expect(service.create(createDto)).rejects.toThrow(
        ConflictException,
      );
      expect(mockRepository.findBySkuAndBranch).toHaveBeenCalledWith(createDto.sku, createDto.branchId);
      expect(mockRepository.create).not.toHaveBeenCalled();
    });

    it('should throw ConflictException if barcode already exists', async () => {
      const createDto: CreateProductDto = {
        name: 'Paracetamol 500mg',
        sku: 'PARA-500',
        barcode: '1234567890123',
        category: 'Pain Relief',
        brand: 'Generic',
        unit: 'Tablet',
        reorderLevel: 100,
      };

      mockRepository.findBySkuAndBranch.mockResolvedValue(null);
      mockRepository.findByBarcodeAndBranch.mockResolvedValue(mockProduct);

      await expect(service.create(createDto)).rejects.toThrow(
        ConflictException,
      );
      expect(mockRepository.findByBarcodeAndBranch).toHaveBeenCalledWith(
        createDto.barcode, createDto.branchId,
      );
      expect(mockRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('findById', () => {
    it('should return a product by ID', async () => {
      mockRepository.findById.mockResolvedValue(mockProduct);

      const result = await service.findById('507f1f77bcf86cd799439011');

      expect(result).toEqual(mockProduct);
      expect(mockRepository.findById).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439011',
      );
    });

    it('should throw NotFoundException if product not found', async () => {
      mockRepository.findById.mockResolvedValue(null);

      await expect(
        service.findById('507f1f77bcf86cd799439011'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('search', () => {
    it('should search products by query', async () => {
      const searchDto = { query: 'Paracetamol' };
      mockRepository.search.mockResolvedValue({ data: [mockProduct], total: 1 });

      const result = await service.search(searchDto);

      expect(result).toMatchObject({ data: [expect.objectContaining({ name: mockProduct.name, stockAvailable: 0, sellingPrice: 0 })], total: 1 });
      expect(mockRepository.search).toHaveBeenCalledWith(
        searchDto.query,
        undefined,
        undefined, undefined, 1, 20, undefined, 'asc',
      );
    });

    it('should search products with category filter', async () => {
      const searchDto = { query: 'Paracetamol', category: 'Pain Relief' };
      mockRepository.search.mockResolvedValue({ data: [mockProduct], total: 1 });

      const result = await service.search(searchDto);

      expect(result).toMatchObject({ data: [expect.objectContaining({ name: mockProduct.name, stockAvailable: 0, sellingPrice: 0 })], total: 1 });
      expect(mockRepository.search).toHaveBeenCalledWith(
        searchDto.query,
        undefined,
        searchDto.category,
        undefined, 1, 20, undefined, 'asc',
      );
    });
  });

  describe('update', () => {
    it('should update a product successfully', async () => {
      const updateDto: UpdateProductDto = { name: 'Updated Name' };
      const updatedProduct = { ...mockProduct, name: 'Updated Name' };

      mockRepository.findById.mockResolvedValue(mockProduct);
      mockRepository.update.mockResolvedValue(updatedProduct);

      const result = await service.update(
        '507f1f77bcf86cd799439011',
        updateDto,
      );

      expect(result).toEqual(updatedProduct);
      expect(mockRepository.update).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439011',
        updateDto,
      );
    });

    it('should throw NotFoundException if product not found', async () => {
      const updateDto: UpdateProductDto = { name: 'Updated Name' };
      mockRepository.findById.mockResolvedValue(null);
      mockRepository.update.mockResolvedValue(null);

      await expect(
        service.update('507f1f77bcf86cd799439011', updateDto),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
