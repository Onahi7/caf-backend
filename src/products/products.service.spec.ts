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

      mockRepository.findBySku.mockResolvedValue(null);
      mockRepository.findByBarcode.mockResolvedValue(null);
      mockRepository.create.mockResolvedValue(mockProduct);

      const result = await service.create(createDto);

      expect(result).toEqual(mockProduct);
      expect(mockRepository.findBySku).toHaveBeenCalledWith(createDto.sku);
      expect(mockRepository.findByBarcode).toHaveBeenCalledWith(
        createDto.barcode,
      );
      expect(mockRepository.create).toHaveBeenCalledWith(createDto);
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

      mockRepository.findBySku.mockResolvedValue(mockProduct);

      await expect(service.create(createDto)).rejects.toThrow(
        ConflictException,
      );
      expect(mockRepository.findBySku).toHaveBeenCalledWith(createDto.sku);
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

      mockRepository.findBySku.mockResolvedValue(null);
      mockRepository.findByBarcode.mockResolvedValue(mockProduct);

      await expect(service.create(createDto)).rejects.toThrow(
        ConflictException,
      );
      expect(mockRepository.findByBarcode).toHaveBeenCalledWith(
        createDto.barcode,
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
      mockRepository.search.mockResolvedValue([mockProduct]);

      const result = await service.search(searchDto);

      expect(result).toEqual([mockProduct]);
      expect(mockRepository.search).toHaveBeenCalledWith(
        searchDto.query,
        undefined,
        undefined,
      );
    });

    it('should search products with category filter', async () => {
      const searchDto = { query: 'Paracetamol', category: 'Pain Relief' };
      mockRepository.search.mockResolvedValue([mockProduct]);

      const result = await service.search(searchDto);

      expect(result).toEqual([mockProduct]);
      expect(mockRepository.search).toHaveBeenCalledWith(
        searchDto.query,
        searchDto.category,
        undefined,
      );
    });
  });

  describe('update', () => {
    it('should update a product successfully', async () => {
      const updateDto: UpdateProductDto = { name: 'Updated Name' };
      const updatedProduct = { ...mockProduct, name: 'Updated Name' };

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
      mockRepository.update.mockResolvedValue(null);

      await expect(
        service.update('507f1f77bcf86cd799439011', updateDto),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
