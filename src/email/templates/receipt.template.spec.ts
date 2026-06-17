import { generateReceiptEmailTemplate } from './receipt.template';
import { ReceiptData } from '../interfaces/email.interface';

describe('Receipt Template', () => {
  const mockReceiptData: ReceiptData = {
    receiptNumber: 'RCP-001',
    items: [
      {
        name: 'Paracetamol 500mg',
        quantity: 2,
        unitPrice: 5000,
        total: 10000,
      },
      {
        name: 'Vitamin C',
        quantity: 1,
        unitPrice: 15000,
        total: 15000,
      },
    ],
    subtotal: 25000,
    discount: 2500,
    total: 22500,
    paymentMethod: 'orange_money',
    timestamp: new Date('2024-01-15T10:30:00Z'),
    branchName: 'CAREfam Pharmacy - Freetown',
    branchAddress: '123 Main Street, Freetown',
    cashierName: 'John Doe',
    customerName: 'Jane Smith',
    customerPhone: '+232 76 123 456',
  };

  describe('Currency Formatting', () => {
    it('should format all monetary values with Le prefix', () => {
      const html = generateReceiptEmailTemplate(mockReceiptData);

      // Check that Le symbol appears in the output
      expect(html).toContain('Le 5,000.00');
      expect(html).toContain('Le 10,000.00');
      expect(html).toContain('Le 15,000.00');
      expect(html).toContain('Le 25,000.00');
      expect(html).toContain('Le 2,500.00');
      expect(html).toContain('Le 22,500.00');
    });

    it('should not contain old Naira currency symbol', () => {
      const html = generateReceiptEmailTemplate(mockReceiptData);

      // Ensure no Naira symbols remain
      expect(html).not.toContain('NGN');
    });

    it('should format currency with thousand separators', () => {
      const html = generateReceiptEmailTemplate(mockReceiptData);

      // Check for comma separators
      expect(html).toContain('Le 5,000.00');
      expect(html).toContain('Le 10,000.00');
      expect(html).toContain('Le 15,000.00');
      expect(html).toContain('Le 25,000.00');
      expect(html).toContain('Le 22,500.00');
    });

    it('should format currency with two decimal places', () => {
      const html = generateReceiptEmailTemplate(mockReceiptData);

      // All amounts should have .00 or proper decimals
      expect(html).toContain('.00');
    });
  });

  describe('Payment Method Display', () => {
    it('should display Orange Money label for orange_money payment method', () => {
      const html = generateReceiptEmailTemplate(mockReceiptData);

      expect(html).toContain('Orange Money');
    });

    it('should display Africell Money label for africell_money payment method', () => {
      const data = { ...mockReceiptData, paymentMethod: 'africell_money' };
      const html = generateReceiptEmailTemplate(data);

      expect(html).toContain('Africell Money');
    });

    it('should display QMoney label for qmoney payment method', () => {
      const data = { ...mockReceiptData, paymentMethod: 'qmoney' };
      const html = generateReceiptEmailTemplate(data);

      expect(html).toContain('QMoney');
    });

    it('should display Cash label for cash payment method', () => {
      const data = { ...mockReceiptData, paymentMethod: 'cash' };
      const html = generateReceiptEmailTemplate(data);

      expect(html).toContain('Cash');
    });

    it('should display Card label for card payment method', () => {
      const data = { ...mockReceiptData, paymentMethod: 'card' };
      const html = generateReceiptEmailTemplate(data);

      expect(html).toContain('Card');
    });

    it('should display Bank Transfer label for bank_transfer payment method', () => {
      const data = { ...mockReceiptData, paymentMethod: 'bank_transfer' };
      const html = generateReceiptEmailTemplate(data);

      expect(html).toContain('Bank Transfer');
    });
  });

  describe('Receipt Structure', () => {
    it('should include receipt number', () => {
      const html = generateReceiptEmailTemplate(mockReceiptData);

      expect(html).toContain('RCP-001');
    });

    it('should include branch name', () => {
      const html = generateReceiptEmailTemplate(mockReceiptData);

      expect(html).toContain('CAREfam Pharmacy - Freetown');
    });

    it('should include cashier name', () => {
      const html = generateReceiptEmailTemplate(mockReceiptData);

      expect(html).toContain('John Doe');
    });

    it('should include customer information when provided', () => {
      const html = generateReceiptEmailTemplate(mockReceiptData);

      expect(html).toContain('Jane Smith');
      expect(html).toContain('+232 76 123 456');
    });

    it('should include all items', () => {
      const html = generateReceiptEmailTemplate(mockReceiptData);

      expect(html).toContain('Paracetamol 500mg');
      expect(html).toContain('Vitamin C');
    });
  });

  describe('Discount Handling', () => {
    it('should display discount when present', () => {
      const html = generateReceiptEmailTemplate(mockReceiptData);

      expect(html).toContain('Discount');
      expect(html).toContain('Le 2,500.00');
    });

    it('should not display discount section when discount is zero', () => {
      const data = { ...mockReceiptData, discount: 0, total: 25000 };
      const html = generateReceiptEmailTemplate(data);

      // Should not contain discount row
      const discountMatches = html.match(/Discount:/g);
      expect(discountMatches).toBeNull();
    });
  });
});
