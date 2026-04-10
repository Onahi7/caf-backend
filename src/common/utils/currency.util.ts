/**
 * Currency Utility for Sierra Leone Localization
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5
 * Properties: 1, 2, 3, 4, 5
 */
export class CurrencyUtil {
  static readonly CURRENCY_CODE = 'SLE';
  static readonly CURRENCY_SYMBOL = 'Le';
  static readonly DECIMAL_PLACES = 2;

  /**
   * Format a monetary amount with SLE currency symbol and proper formatting
   * Property 1: Currency symbol prefix
   * Property 2: Two decimal places
   * Property 3: Thousand separators
   * Requirements: 1.1, 1.2, 1.3
   *
   * @param amount - The numeric amount to format
   * @returns Formatted string with "Le" prefix, two decimal places, and comma separators
   * @example
   * CurrencyUtil.format(1234.56) // "Le 1,234.56"
   * CurrencyUtil.format(100) // "Le 100.00"
   */
  static format(amount: number): string {
    // Handle invalid inputs
    if (amount === null || amount === undefined || isNaN(amount)) {
      return `${this.CURRENCY_SYMBOL} 0.00`;
    }

    // Format with two decimal places
    const fixedAmount = amount.toFixed(this.DECIMAL_PLACES);

    // Split into integer and decimal parts
    const [integerPart, decimalPart] = fixedAmount.split('.');

    // Add thousand separators
    const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

    return `${this.CURRENCY_SYMBOL} ${formattedInteger}.${decimalPart}`;
  }

  /**
   * Format a monetary amount without the currency symbol
   * Requirements: 1.2, 1.3
   *
   * @param amount - The numeric amount to format
   * @returns Formatted string with two decimal places and comma separators (no symbol)
   * @example
   * CurrencyUtil.formatWithoutSymbol(1234.56) // "1,234.56"
   */
  static formatWithoutSymbol(amount: number): string {
    // Handle invalid inputs
    if (amount === null || amount === undefined || isNaN(amount)) {
      return '0.00';
    }

    // Format with two decimal places
    const fixedAmount = amount.toFixed(this.DECIMAL_PLACES);

    // Split into integer and decimal parts
    const [integerPart, decimalPart] = fixedAmount.split('.');

    // Add thousand separators
    const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

    return `${formattedInteger}.${decimalPart}`;
  }

  /**
   * Parse a formatted currency string back to a number
   *
   * @param formattedAmount - The formatted currency string
   * @returns The numeric value
   * @example
   * CurrencyUtil.parse("Le 1,234.56") // 1234.56
   * CurrencyUtil.parse("1,234.56") // 1234.56
   */
  static parse(formattedAmount: string): number {
    if (!formattedAmount || typeof formattedAmount !== 'string') {
      return 0;
    }

    // Remove currency symbol, spaces, and commas
    const cleanedAmount = formattedAmount
      .replace(this.CURRENCY_SYMBOL, '')
      .replace(/\s/g, '')
      .replace(/,/g, '');

    const parsed = parseFloat(cleanedAmount);

    return isNaN(parsed) ? 0 : parsed;
  }
}
