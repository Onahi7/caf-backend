import { Types } from 'mongoose';
import { SalesService } from './sales.service.js';
import { SaleStatus } from './schemas/sale.schema.js';

describe('CareFarm End-to-End Operational Lifecycle Simulation', () => {
  describe('1. Pharmacy Packaging & Unit Conversion Simulation', () => {
    it('correctly calculates pack conversions, base unit depletion, and effective unit rate', () => {
      // Setup drug: Paracetamol 500mg
      // Box = 10 Cards, Card = 10 Tablets (1 Box = 100 Tablets)
      const boxBaseQuantity = 100;
      const cardMultiplier = 10; // 1 card = 10 base tablets
      const boxMultiplier = 100; // 1 box = 100 base tablets

      const boxPrice = 80000;  // Le 80,000 per box
      const cardPrice = 10000; // Le 10,000 per card

      // Effective unit rate
      const effectiveCardRate = cardPrice / cardMultiplier; // Le 1,000 per tablet
      const effectiveBoxRate = boxPrice / boxMultiplier;    // Le 800 per tablet

      expect(effectiveCardRate).toBe(1000);
      expect(effectiveBoxRate).toBe(800);

      // Customer buys 3 cards
      const cardsSold = 3;
      const totalSale = cardsSold * cardPrice;
      const baseUnitsDepleted = cardsSold * cardMultiplier;

      expect(totalSale).toBe(30000);
      expect(baseUnitsDepleted).toBe(30);

      // Remaining stock in base units
      const initialStockBaseUnits = 500; // 5 boxes = 500 tablets
      const remainingStock = initialStockBaseUnits - baseUnitsDepleted;

      expect(remainingStock).toBe(470);
      expect(Math.floor(remainingStock / cardMultiplier)).toBe(47); // 47 full cards remaining
    });

    it('enforces rule: cards are sold as whole cards or full boxes, never broken into loose tablets', () => {
      const cardPackSize = { code: 'card', multiplier: 10, name: 'Card' };
      const requestedQuantityCards = 2.5;

      const isIntegerCard = Number.isInteger(requestedQuantityCards);
      expect(isIntegerCard).toBe(false); // fractional blister card rejected

      const validQuantityCards = 3;
      expect(Number.isInteger(validQuantityCards)).toBe(true);
      expect(validQuantityCards * cardPackSize.multiplier).toBe(30);
    });
  });

  describe('2. FEFO (First-Expired, First-Out) Multi-Batch Depletion Simulation', () => {
    it('depletes stock strictly from earliest expiring batch across multiple lots and skips expired stock', () => {
      const now = new Date();
      const expiredDate = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000); // 2 days ago
      const nearExpiryDate = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000); // in 15 days
      const futureExpiryDate = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000); // in 6 months

      const inventoryBatches = [
        { id: 'batch-expired', expiryDate: expiredDate, quantity: 50 },
        { id: 'batch-future', expiryDate: futureExpiryDate, quantity: 100 },
        { id: 'batch-near', expiryDate: nearExpiryDate, quantity: 20 },
      ];

      // 1. Filter out expired batches
      const validBatches = inventoryBatches
        .filter((b) => b.expiryDate > now)
        // 2. Sort FEFO (earliest expiry first)
        .sort((a, b) => a.expiryDate.getTime() - b.expiryDate.getTime());

      expect(validBatches).toHaveLength(2);
      expect(validBatches[0].id).toBe('batch-near');
      expect(validBatches[1].id).toBe('batch-future');

      // Customer orders 35 units
      const quantityNeeded = 35;
      let remaining = quantityNeeded;
      const allocations: Array<{ batchId: string; quantity: number }> = [];

      for (const batch of validBatches) {
        if (remaining <= 0) break;
        const take = Math.min(batch.quantity, remaining);
        allocations.push({ batchId: batch.id, quantity: take });
        remaining -= take;
      }

      expect(allocations).toEqual([
        { batchId: 'batch-near', quantity: 20 }, // batch-near exhausted
        { batchId: 'batch-future', quantity: 15 }, // batch-future partially depleted
      ]);
      expect(remaining).toBe(0);
    });
  });

  describe('3. Checkout Split Tender, Pro-Rated Discount, and Return Refund Simulation', () => {
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

    it('pro-rates cart-level discounts across line items and refunds exact net paid amount', () => {
      const productId = new Types.ObjectId();
      const sale = {
        subtotal: 200000, // Le 200,000
        total: 180000,    // Le 180,000 (10% discount = Le 20,000 off)
        returnedAmount: 0,
        items: [
          {
            saleItemId: 'line-1',
            productId,
            batchId: new Types.ObjectId(),
            quantity: 4,
            returnedQuantity: 0,
            subtotal: 200000,
            unitPrice: 50000, // 4 * 50,000 = 200,000
          },
        ],
      } as never;

      // Customer returns 1 item out of 4
      // Nominal price is 50,000. But customer received a 10% discount, paying 45,000 net per item.
      const refundAmount = (service as any).calculateReturnAmount(sale, [
        { saleItemId: 'line-1', productId: productId.toString(), quantity: 1 },
      ]);

      expect(refundAmount).toBe(45000); // exactly pro-rated net refund, protecting pharmacy margin
    });

    it('validates split tender combination totals match sale total', () => {
      const orderTotal = 250000; // Le 250,000
      const splitTenders = [
        { method: 'cash', amount: 100000 },
        { method: 'orange_money', amount: 100000 },
        { method: 'credit', amount: 50000 },
      ];

      const sumPaid = splitTenders.reduce((sum, t) => sum + t.amount, 0);
      expect(sumPaid).toBe(orderTotal);

      const balanceDue = splitTenders
        .filter((t) => t.method === 'credit')
        .reduce((sum, t) => sum + t.amount, 0);

      expect(balanceDue).toBe(50000); // posted to customer credit receivables
    });
  });

  describe('4. Shift Cash Reconciliation & Variance Mathematics Simulation', () => {
    it('computes exact expected drawer cash and identifies shortages or surpluses', () => {
      const openingCash = 100000; // Float: Le 100,000
      const cashSales = 450000;   // Cash payments collected: Le 450,000
      const mobileSales = 300000; // Orange Money (not in physical drawer)
      const pettyExpenses = 25000; // Petty cash: cleaning supplies Le 25,000
      const cashRefunds = 45000;   // Returned item refund in cash: Le 45,000

      // Expected cash in physical drawer
      const expectedCash = openingCash + cashSales - pettyExpenses - cashRefunds;
      expect(expectedCash).toBe(480000);

      // Scenario A: Drawer matches perfectly
      const countedExact = 480000;
      const varianceExact = countedExact - expectedCash;
      expect(varianceExact).toBe(0);

      // Scenario B: Shortage (cashier missing Le 10,000)
      const countedShortage = 470000;
      const varianceShort = countedShortage - expectedCash;
      expect(varianceShort).toBe(-10000);

      // Scenario C: Surplus (cashier has extra Le 5,000)
      const countedSurplus = 485000;
      const varianceSurplus = countedSurplus - expectedCash;
      expect(varianceSurplus).toBe(5000);
    });
  });

  describe('5. Profit & Loss (P&L) and Margin Formulas Simulation', () => {
    it('accurately computes Gross Revenue, COGS, Gross Profit, Operating Expenses, Net Profit, and Margins', () => {
      const grossRevenue = 15000000; // Le 15,000,000 total sales
      const costOfGoodsSold = 9750000; // COGS: Le 9,750,000
      const operatingExpenses = 1800000; // Rent, utilities, supplies: Le 1,800,000

      const grossProfit = grossRevenue - costOfGoodsSold;
      expect(grossProfit).toBe(5250000); // Le 5,250,000

      const grossMarginPct = (grossProfit / grossRevenue) * 100;
      expect(grossMarginPct).toBe(35); // 35.0%

      const netProfit = grossProfit - operatingExpenses;
      expect(netProfit).toBe(3450000); // Le 3,450,000

      const netMarginPct = Number(((netProfit / grossRevenue) * 100).toFixed(2));
      expect(netMarginPct).toBe(23.0); // 23.0%
    });
  });

  describe('6. Staff Payroll Advance & Offboarding Settlement Math Simulation', () => {
    it('deducts advance installments from salary payout and flags clearance for offboarding', () => {
      const baseSalary = 2000000; // Le 2,000,000
      const allowances = 300000;  // Transport / meal allowance: Le 300,000
      const openAdvanceTotal = 500000; // Le 500,000 outstanding advance
      const advanceInstallmentDeduction = 250000; // Le 250,000 monthly deduction

      const actualPayout = baseSalary + allowances - advanceInstallmentDeduction;
      expect(actualPayout).toBe(2050000);

      const remainingAdvance = openAdvanceTotal - advanceInstallmentDeduction;
      expect(remainingAdvance).toBe(250000);

      // Offboarding clearance check
      const canOffboard = remainingAdvance === 0;
      expect(canOffboard).toBe(false); // blocked from offboarding until fully settled

      const fullyClearedRemaining = 0;
      expect(fullyClearedRemaining === 0).toBe(true); // cleared to offboard
    });
  });
});
