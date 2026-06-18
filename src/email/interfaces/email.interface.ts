export interface SendReceiptParams {
  to: string;
  receiptData: ReceiptData;
}

export interface ReceiptData {
  receiptNumber: string;
  items: ReceiptItem[];
  subtotal: number;
  discount: number;
  total: number;
  paymentMethod: string;
  timestamp: Date;
  branchName: string;
  branchAddress?: string;
  branchCurrencyCode?: string;
  cashierName: string;
  customerName?: string;
  customerPhone?: string;
}

export interface ReceiptItem {
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
}
