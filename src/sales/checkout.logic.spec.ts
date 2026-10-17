import { CheckoutService } from './checkout.service.js';
import { UserRole } from '../users/schemas/user.schema.js';

describe('CheckoutService ownership validation', () => {
  it('rejects a shift belonging to another terminal', async () => {
    const shifts = {
      findById: jest.fn().mockResolvedValue({
        branchId: { toString: () => 'branch-a' },
        cashierId: { toString: () => 'cashier-a' },
        terminalId: 'terminal-other',
      }),
      canAcceptSales: jest.fn().mockResolvedValue(true),
    };
    const service = new CheckoutService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      shifts as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.processCheckout(
        {
          branchId: 'branch-a',
          shiftId: 'shift-a',
          terminalId: 'terminal-a',
          items: [],
          paymentMethod: 'cash' as never,
        },
        {
          userId: 'cashier-a',
          username: 'cashier',
          role: UserRole.CASHIER,
          branchId: 'branch-a',
        },
      ),
    ).rejects.toThrow('does not belong to this cashier, branch, and terminal');
  });
});

describe('CheckoutService card and laboratory selling units', () => {
  const actor = { userId: 'cashier-a', username: 'qa', role: UserRole.SUPER_ADMIN, branchId: 'branch-a' };
  function checkout(product: Record<string, unknown>) {
    return new CheckoutService(
      {} as never, {} as never, {} as never, {} as never, {} as never,
      {} as never, {} as never,
      { findById: () => ({ exec: async () => ({ name: 'QA Product', branchId: 'branch-a', unit: 'card', basePrice: 50, suggestedRetailPrice: 50, quantityAvailable: 30, packSizes: [], ...product }) }) } as never,
      { find: () => ({ lean: () => ({ exec: async () => [] }) }) } as never,
      {} as never, {} as never,
    );
  }

  it('prices two cards as two cards even when their contents are 14 tablets each', async () => {
    const service = checkout({ quantityAvailable: 2, contentsDescription: '14 tablets per card' });
    const quote = await service.quote({ items: [{ productId: 'qa-product', quantity: 2, unitPrice: 1, quantityInBaseUnits: 28 }] }, actor);
    expect(quote.total).toBe(100);
  });

  it('rejects individual-tablet and unconfigured received-pack sales for a card-only product', async () => {
    const service = checkout({ purchaseUnit: 'pack', unitsPerPurchaseUnit: 3 });
    for (const unit of ['tablet', 'pack']) {
      await expect(service.quote({ items: [{ productId: 'qa-product', quantity: 1, unitPrice: 1, packSize: { name: unit, unit, quantityPerPack: 1 } }] }, actor)).rejects.toThrow('not configured');
    }
  });

  it('rejects fractional card sales', async () => {
    await expect(checkout({}).quote({ items: [{ productId: 'qa-product', quantity: 1.5, unitPrice: 50 }] }, actor)).rejects.toThrow('whole cards');
  });

  it('uses configured box prices and converts kit stock for whole-box sales', async () => {
    const pack = { name: 'Box of 25 kits', unit: 'box', quantityPerPack: 25, sellingPrice: 450 };
    const service = checkout({ unit: 'kit', basePrice: 20, quantityAvailable: 125, packSizes: [pack] });
    const quote = await service.quote({ items: [{ productId: 'qa-product', quantity: 2, unitPrice: 1, packSize: pack }] }, actor);
    expect(quote.total).toBe(900);
    await expect(checkout({ unit: 'kit', quantityAvailable: 30, packSizes: [pack] }).quote({ items: [{ productId: 'qa-product', quantity: 2, unitPrice: 1, quantityInBaseUnits: 1, packSize: pack }] }, actor)).rejects.toThrow('Requested 50');
  });
});
