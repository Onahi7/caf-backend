import { CurrencyUtil } from './currency.util';

describe('CurrencyUtil', () => {
  describe('format', () => {
    it('should format amount with Le prefix', () => {
      const result = CurrencyUtil.format(100);
      expect(result).toContain('Le');
    });

    it('should format with two decimal places', () => {
      const result = CurrencyUtil.format(100);
      expect(result).toBe('Le 100.00');
    });

    it('should format with thousand separators', () => {
      const result = CurrencyUtil.format(1234.56);
      expect(result).toBe('Le 1,234.56');
    });

    it('should handle large numbers', () => {
      const result = CurrencyUtil.format(1234567.89);
      expect(result).toBe('Le 1,234,567.89');
    });

    it('should handle zero', () => {
      const result = CurrencyUtil.format(0);
      expect(result).toBe('Le 0.00');
    });

    it('should handle negative numbers', () => {
      const result = CurrencyUtil.format(-100.5);
      expect(result).toBe('Le -100.50');
    });

    it('should handle invalid inputs', () => {
      expect(CurrencyUtil.format(null as any)).toBe('Le 0.00');
      expect(CurrencyUtil.format(undefined as any)).toBe('Le 0.00');
      expect(CurrencyUtil.format(NaN)).toBe('Le 0.00');
    });
  });

  describe('formatWithoutSymbol', () => {
    it('should format without currency symbol', () => {
      const result = CurrencyUtil.formatWithoutSymbol(1234.56);
      expect(result).toBe('1,234.56');
      expect(result).not.toContain('Le');
    });

    it('should handle invalid inputs', () => {
      expect(CurrencyUtil.formatWithoutSymbol(null as any)).toBe('0.00');
      expect(CurrencyUtil.formatWithoutSymbol(undefined as any)).toBe('0.00');
      expect(CurrencyUtil.formatWithoutSymbol(NaN)).toBe('0.00');
    });
  });

  describe('parse', () => {
    it('should parse formatted currency string', () => {
      const result = CurrencyUtil.parse('Le 1,234.56');
      expect(result).toBe(1234.56);
    });

    it('should parse string without symbol', () => {
      const result = CurrencyUtil.parse('1,234.56');
      expect(result).toBe(1234.56);
    });

    it('should handle invalid inputs', () => {
      expect(CurrencyUtil.parse('')).toBe(0);
      expect(CurrencyUtil.parse(null as any)).toBe(0);
      expect(CurrencyUtil.parse(undefined as any)).toBe(0);
      expect(CurrencyUtil.parse('invalid')).toBe(0);
    });
  });

  describe('constants', () => {
    it('should have correct currency code', () => {
      expect(CurrencyUtil.CURRENCY_CODE).toBe('SLE');
    });

    it('should have correct currency symbol', () => {
      expect(CurrencyUtil.CURRENCY_SYMBOL).toBe('Le');
    });

    it('should have correct decimal places', () => {
      expect(CurrencyUtil.DECIMAL_PLACES).toBe(2);
    });
  });
});
