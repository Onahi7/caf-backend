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
