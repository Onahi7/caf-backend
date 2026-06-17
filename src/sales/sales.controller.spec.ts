import { Test, TestingModule } from '@nestjs/testing';
import { SalesController } from './sales.controller.js';
import { SalesService } from './sales.service.js';
import { CheckoutService } from './checkout.service.js';
import { ReceiptService } from './receipt.service.js';
import { PaymentMethod } from './schemas/sale.schema.js';
import { CurrencyUtil } from '../common/utils/currency.util.js';
import { getPaymentMethodLabel } from '../common/constants/payment-methods.constant.js';
import { RedisService } from '../redis/redis.service.js';
import { EmailService } from '../email/email.service.js';

/**
 * Unit tests for SalesController
 * Requirements: 2.7, 5.5, 6.1, 6.3, 1.4
 * Property 6: Payment method persistence
 * Property 7: Payment method validation
 * Property 13: Mobile money reference storage
 * Property 15: Optional mobile money reference
 */
describe('SalesController', () => {
  let controller: SalesController;
  let salesService: jest.Mocked<SalesService>;
  let checkoutService: jest.Mocked<CheckoutService>;

  const mockSale: any = {
    _id: '507f1f77bcf86cd799439011',
    branchId: '507f1f77bcf86cd799439012',
    shiftId: '507f1f77bcf86cd799439013',
    terminalId: 'TERM-001',
    cashierId: '507f1f77bcf86cd799439014',
    items: [],
    subtotal: 50000,
    discount: 5000,
    total: 45000,
    paymentMethod: PaymentMethod.ORANGE_MONEY,
    paymentReference: 'OM-TXN-123456',
    receiptNumber: 'RCP-001',
    returnedAmount: 0,
    status: 'completed',
    toObject: function () {
      return { ...this };
    },
  };

  beforeEach(async () => {
    const mockSalesService = {
      findById: jest.fn(),
      findByReceiptNumber: jest.fn(),
      findAll: jest.fn(),
      findByShift: jest.fn(),
      findByBranch: jest.fn(),
      calculateShiftTotal: jest.fn(),
      getSalesStats: jest.fn(),
      processReturn: jest.fn(),
      verifyPrescription: jest.fn(),
      getSalesPendingPrescriptionVerification: jest.fn(),
    };

    const mockCheckoutService = {
      processCheckout: jest.fn(),
      checkStockAvailability: jest.fn(),
    };

    const mockRedisService = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    };
    const mockReceiptService = {};
    const mockEmailService = {};

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SalesController],
      providers: [
        { provide: SalesService, useValue: mockSalesService },
        { provide: CheckoutService, useValue: mockCheckoutService },
        { provide: RedisService, useValue: mockRedisService },
        { provide: ReceiptService, useValue: mockReceiptService },
        { provide: EmailService, useValue: mockEmailService },
      ],
    }).compile();

    controller = module.get<SalesController>(SalesController);
    salesService = module.get(SalesService);
    checkoutService = module.get(CheckoutService);
  });

  describe('checkout', () => {
    it('should format currency in checkout response', async () => {
      // Arrange
      const createSaleDto = {
        branchId: '507f1f77bcf86cd799439012',
        shiftId: '507f1f77bcf86cd799439013',
        terminalId: 'TERM-001',
        items: [],
        paymentMethod: PaymentMethod.ORANGE_MONEY,
        paymentReference: 'OM-TXN-123456',
      };

      const checkoutResult = {
        sale: mockSale,
        receiptNumber: 'RCP-001',
        itemsProcessed: 2,
        totalAmount: 45000,
      };

      checkoutService.processCheckout.mockResolvedValue(checkoutResult);

      // Act
      const result = await controller.checkout(createSaleDto, {
        userId: '507f1f77bcf86cd799439014',
      });

      // Assert
      expect(result.data.totalFormatted).toBe(CurrencyUtil.format(45000));
      expect(result.data.subtotalFormatted).toBe(CurrencyUtil.format(50000));
      expect(result.data.discountFormatted).toBe(CurrencyUtil.format(5000));
      expect(result.data.paymentMethod).toBe(PaymentMethod.ORANGE_MONEY);
      expect(result.data.paymentMethodLabel).toBe('Orange Money');
      expect(result.data.paymentReference).toBe('OM-TXN-123456');
    });

    it('should handle checkout without payment reference', async () => {
      // Arrange
      const createSaleDto = {
        branchId: '507f1f77bcf86cd799439012',
        shiftId: '507f1f77bcf86cd799439013',
        terminalId: 'TERM-001',
        items: [],
        paymentMethod: PaymentMethod.CASH,
      };

      const saleWithoutRef = {
        ...mockSale,
        paymentMethod: PaymentMethod.CASH,
        paymentReference: undefined,
      };
      const checkoutResult = {
        sale: saleWithoutRef,
        receiptNumber: 'RCP-002',
        itemsProcessed: 1,
        totalAmount: 45000,
      };

      checkoutService.processCheckout.mockResolvedValue(checkoutResult);

      // Act
      const result = await controller.checkout(createSaleDto, {
        userId: '507f1f77bcf86cd799439014',
      });

      // Assert
      expect(result.data.paymentMethod).toBe(PaymentMethod.CASH);
      expect(result.data.paymentMethodLabel).toBe('Cash');
      expect(result.data.paymentReference).toBeUndefined();
    });
  });

  describe('findById', () => {
    it('should format currency and payment method in response', async () => {
      // Arrange
      salesService.findById.mockResolvedValue(mockSale);

      // Act
      const result = await controller.findById('507f1f77bcf86cd799439011');

      // Assert
      expect(result.data.totalFormatted).toBe(CurrencyUtil.format(45000));
      expect(result.data.subtotalFormatted).toBe(CurrencyUtil.format(50000));
      expect(result.data.discountFormatted).toBe(CurrencyUtil.format(5000));
      expect(result.data.paymentMethodLabel).toBe('Orange Money');
    });
  });

  describe('findAll', () => {
    it('should format currency for all sales', async () => {
      // Arrange
      salesService.findAll.mockResolvedValue([mockSale, mockSale] as any);

      // Act
      const result = await controller.findAll(
        {
          userId: '507f1f77bcf86cd799439014',
          username: 'admin',
          role: 'super_admin',
        },
        {},
      );

      // Assert
      expect(result.data).toHaveLength(2);
      expect(result.data[0].totalFormatted).toBe(CurrencyUtil.format(45000));
      expect(result.data[0].paymentMethodLabel).toBe('Orange Money');
    });
  });

  describe('getShiftTotal', () => {
    it('should format shift total currency', async () => {
      // Arrange
      salesService.calculateShiftTotal.mockResolvedValue(150000);

      // Act
      const result = await controller.getShiftTotal('507f1f77bcf86cd799439013');

      // Assert
      expect(result.data.total).toBe(150000);
      expect(result.data.totalFormatted).toBe(CurrencyUtil.format(150000));
    });
  });

  describe('getSalesStats', () => {
    it('should format currency in sales statistics', async () => {
      // Arrange
      const stats = {
        totalSales: 10,
        totalAmount: 500000,
        totalReturns: 2,
        averageTransaction: 50000,
      };
      salesService.getSalesStats.mockResolvedValue(stats);

      // Act
      const result = await controller.getSalesStats(
        '507f1f77bcf86cd799439012',
        '2024-01-01',
        '2024-01-31',
      );

      // Assert
      expect(result.data.totalAmountFormatted).toBe(
        CurrencyUtil.format(500000),
      );
      expect(result.data.averageTransactionFormatted).toBe(
        CurrencyUtil.format(50000),
      );
    });
  });

  describe('payment method validation', () => {
    it('should accept all new payment methods', () => {
      // Test that enum includes all new payment methods
      expect(PaymentMethod.ORANGE_MONEY).toBe('orange_money');
      expect(PaymentMethod.AFRICELL_MONEY).toBe('africell_money');
      expect(PaymentMethod.QMONEY).toBe('qmoney');
      expect(PaymentMethod.BANK_TRANSFER).toBe('bank_transfer');
    });

    it('should provide correct labels for all payment methods', () => {
      expect(getPaymentMethodLabel('orange_money')).toBe('Orange Money');
      expect(getPaymentMethodLabel('africell_money')).toBe('Africell Money');
      expect(getPaymentMethodLabel('qmoney')).toBe('QMoney');
      expect(getPaymentMethodLabel('bank_transfer')).toBe('Bank Transfer');
      expect(getPaymentMethodLabel('cash')).toBe('Cash');
      expect(getPaymentMethodLabel('card')).toBe('Card');
    });
  });
});
