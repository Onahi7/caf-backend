/**
 * Payment Method Constants for Sierra Leone Localization
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.8, 5.3
 * Property 9: Receipt payment method display
 */

/**
 * Human-readable labels for payment methods
 * Used in receipts, reports, and UI displays
 */
export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: 'Cash',
  card: 'Card',
  orange_money: 'Orange Money',
  africell_money: 'Africell Money',
  qmoney: 'QMoney',
  bank_transfer: 'Bank Transfer',
  // Legacy payment methods (for backward compatibility)
  mobile: 'Mobile Money',
  insurance: 'Insurance',
  split: 'Split Payment',
};

/**
 * Get the display label for a payment method
 * @param paymentMethod - The payment method enum value
 * @returns The human-readable label
 */
export function getPaymentMethodLabel(paymentMethod: string): string {
  return PAYMENT_METHOD_LABELS[paymentMethod] || paymentMethod;
}

/**
 * Mobile money payment methods
 * Used to identify which payment methods require mobile money handling
 */
export const MOBILE_MONEY_METHODS = [
  'orange_money',
  'africell_money',
  'qmoney',
];

/**
 * Check if a payment method is a mobile money method
 * @param paymentMethod - The payment method to check
 * @returns True if the payment method is a mobile money method
 */
export function isMobileMoneyMethod(paymentMethod: string): boolean {
  return MOBILE_MONEY_METHODS.includes(paymentMethod);
}
