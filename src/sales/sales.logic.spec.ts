import { Types } from 'mongoose';
import { SalesService } from './sales.service.js';
import { SaleStatus } from './schemas/sale.schema.js';

describe('SalesService return calculations', () => {
  const service = new SalesService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  const productId = new Types.ObjectId();
  const sale = {
    subtotal: 100,
    total: 90,
    returnedAmount: 0,
    items: [
      {
        saleItemId: 'line-a',
        productId,
        batchId: new Types.ObjectId(),
        quantity: 5,
        returnedQuantity: 0,
        subtotal: 100,
        unitPrice: 20,
      },
    ],
  } as never;

  it('refunds the net paid amount after discount/tax allocation', () => {
    const amount = (service as any).calculateReturnAmount(sale, [
      { saleItemId: 'line-a', productId: productId.toString(), quantity: 2 },
    ]);
    expect(amount).toBe(36);
  });

  it('tracks full return status by sale line rather than product id', () => {
    const status = (service as any).determineReturnStatus(sale, [
      { saleItemId: 'line-a', productId: productId.toString(), quantity: 5 },
    ]);
    expect(status).toBe(SaleStatus.RETURNED);
  });

  it('rejects ambiguous legacy multi-batch product returns', () => {
    const ambiguousSale = {
      ...sale,
      items: [sale.items[0], { ...sale.items[0], saleItemId: 'line-b' }],
    };
    expect(() =>
      (service as any).resolveReturnItem(ambiguousSale, {
        productId: productId.toString(),
        quantity: 1,
      }),
    ).toThrow('saleItemId is required');
  });
});
