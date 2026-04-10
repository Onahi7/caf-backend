import { Test, TestingModule } from '@nestjs/testing';
import { WebSocketGateway } from './websocket.gateway';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PAYMENT_METHOD_LABELS } from '../common/constants/payment-methods.constant';
import type { SaleUpdateEvent } from './events.service';

describe('WebSocketGateway - Sale Update Events', () => {
  let gateway: WebSocketGateway;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebSocketGateway,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(
              (_key: string, defaultValue?: unknown) => defaultValue,
            ),
          },
        },
        {
          provide: JwtService,
          useValue: {
            verifyAsync: jest.fn(),
          },
        },
        {
          provide: EventEmitter2,
          useValue: {
            emit: jest.fn(),
          },
        },
      ],
    }).compile();

    gateway = module.get<WebSocketGateway>(WebSocketGateway);

    // Mock the server
    gateway.server = {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
    } as any;
  });

  describe('handleSaleUpdateEvent', () => {
    it('should format currency in sale update events', () => {
      const saleEvent: SaleUpdateEvent = {
        saleId: 'sale123',
        branchId: 'branch1',
        shiftId: 'shift1',
        total: 150000,
        paymentMethod: 'cash',
        items: [
          {
            productId: 'prod1',
            batchId: 'batch1',
            quantity: 2,
          },
        ],
        updateType: 'completed',
        timestamp: new Date(),
      };

      const emitSpy = jest.spyOn(gateway.server, 'emit');

      gateway.handleSaleUpdateEvent(saleEvent);

      expect(emitSpy).toHaveBeenCalledWith(
        'sale:update',
        expect.objectContaining({
          saleId: 'sale123',
          total: 150000,
          totalFormatted: 'Le 150,000.00',
          paymentMethod: 'cash',
          paymentMethodLabel: 'Cash',
        }),
      );
    });

    it('should include payment method labels for mobile money', () => {
      const saleEvent: SaleUpdateEvent = {
        saleId: 'sale456',
        branchId: 'branch1',
        shiftId: 'shift1',
        total: 75500.5,
        paymentMethod: 'orange_money',
        paymentReference: 'OM123456',
        items: [],
        updateType: 'completed',
        timestamp: new Date(),
      };

      const emitSpy = jest.spyOn(gateway.server, 'emit');

      gateway.handleSaleUpdateEvent(saleEvent);

      expect(emitSpy).toHaveBeenCalledWith(
        'sale:update',
        expect.objectContaining({
          totalFormatted: 'Le 75,500.50',
          paymentMethod: 'orange_money',
          paymentMethodLabel: 'Orange Money',
          paymentReference: 'OM123456',
        }),
      );
    });

    it('should handle all payment methods correctly', () => {
      const paymentMethods = [
        'cash',
        'card',
        'orange_money',
        'africell_money',
        'qmoney',
        'bank_transfer',
      ];

      paymentMethods.forEach((method) => {
        const saleEvent: SaleUpdateEvent = {
          saleId: `sale_${method}`,
          branchId: 'branch1',
          shiftId: 'shift1',
          total: 100000,
          paymentMethod: method,
          items: [],
          updateType: 'completed',
          timestamp: new Date(),
        };

        const emitSpy = jest.spyOn(gateway.server, 'emit');

        gateway.handleSaleUpdateEvent(saleEvent);

        expect(emitSpy).toHaveBeenCalledWith(
          'sale:update',
          expect.objectContaining({
            paymentMethod: method,
            paymentMethodLabel: PAYMENT_METHOD_LABELS[method],
          }),
        );
      });
    });

    it('should format currency consistently for different amounts', () => {
      const testCases = [
        { amount: 0, expected: 'Le 0.00' },
        { amount: 100, expected: 'Le 100.00' },
        { amount: 1000, expected: 'Le 1,000.00' },
        { amount: 1234.56, expected: 'Le 1,234.56' },
        { amount: 1000000, expected: 'Le 1,000,000.00' },
      ];

      testCases.forEach(({ amount, expected }) => {
        const saleEvent: SaleUpdateEvent = {
          saleId: `sale_${amount}`,
          branchId: 'branch1',
          shiftId: 'shift1',
          total: amount,
          paymentMethod: 'cash',
          items: [],
          updateType: 'completed',
          timestamp: new Date(),
        };

        const emitSpy = jest.spyOn(gateway.server, 'emit');

        gateway.handleSaleUpdateEvent(saleEvent);

        expect(emitSpy).toHaveBeenCalledWith(
          'sale:update',
          expect.objectContaining({
            total: amount,
            totalFormatted: expected,
          }),
        );
      });
    });

    it('should handle optional payment reference', () => {
      const saleEventWithRef: SaleUpdateEvent = {
        saleId: 'sale_with_ref',
        branchId: 'branch1',
        shiftId: 'shift1',
        total: 50000,
        paymentMethod: 'qmoney',
        paymentReference: 'QM789',
        items: [],
        updateType: 'completed',
        timestamp: new Date(),
      };

      const saleEventWithoutRef: SaleUpdateEvent = {
        saleId: 'sale_without_ref',
        branchId: 'branch1',
        shiftId: 'shift1',
        total: 50000,
        paymentMethod: 'cash',
        items: [],
        updateType: 'completed',
        timestamp: new Date(),
      };

      const emitSpy = jest.spyOn(gateway.server, 'emit');

      gateway.handleSaleUpdateEvent(saleEventWithRef);
      expect(emitSpy).toHaveBeenCalledWith(
        'sale:update',
        expect.objectContaining({
          paymentReference: 'QM789',
        }),
      );

      gateway.handleSaleUpdateEvent(saleEventWithoutRef);
      expect(emitSpy).toHaveBeenCalledWith(
        'sale:update',
        expect.objectContaining({
          paymentReference: undefined,
        }),
      );
    });
  });
});
