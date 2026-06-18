import { ReceiptData } from '../interfaces/email.interface';
import { CurrencyUtil } from '../../common/utils/currency.util';
import { getPaymentMethodLabel } from '../../common/constants/payment-methods.constant';

/**
 * Generate HTML email template for receipt
 * Requirements: 3.1, 3.2, 3.3, 3.4, 4.5
 * Creates a mobile-friendly, professional receipt email with branch currency formatting
 * Property 8: Receipt currency formatting
 * Property 9: Receipt payment method display
 * Property 10: Email and print formatting consistency
 */
export function generateReceiptEmailTemplate(data: ReceiptData): string {
  const currencyCode = data.branchCurrencyCode || 'SLE';
  const formattedDate = new Date(data.timestamp).toLocaleString('en-NG', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const itemsHtml = data.items
    .map(
      (item) => `
    <tr>
      <td style="padding: 12px 8px; border-bottom: 1px solid #e5e7eb;">
        ${item.name}
      </td>
      <td style="padding: 12px 8px; border-bottom: 1px solid #e5e7eb; text-align: center;">
        ${item.quantity}
      </td>
      <td style="padding: 12px 8px; border-bottom: 1px solid #e5e7eb; text-align: right;">
        ${CurrencyUtil.format(item.unitPrice, currencyCode)}
      </td>
      <td style="padding: 12px 8px; border-bottom: 1px solid #e5e7eb; text-align: right; font-weight: 600;">
        ${CurrencyUtil.format(item.total, currencyCode)}
      </td>
    </tr>
  `,
    )
    .join('');

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Receipt #${data.receiptNumber}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 40px 20px;">
        <!-- Main Container -->
        <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 32px 32px 24px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 8px 8px 0 0; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">
                ${data.branchName}
              </h1>
              ${data.branchAddress ? `<p style="margin: 8px 0 0; color: #e0e7ff; font-size: 14px;">${data.branchAddress}</p>` : ''}
            </td>
          </tr>

          <!-- Receipt Info -->
          <tr>
            <td style="padding: 24px 32px;">
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding-bottom: 16px;">
                    <p style="margin: 0; color: #6b7280; font-size: 14px;">Receipt Number</p>
                    <p style="margin: 4px 0 0; color: #111827; font-size: 18px; font-weight: 700;">
                      #${data.receiptNumber}
                    </p>
                  </td>
                  <td style="padding-bottom: 16px; text-align: right;">
                    <p style="margin: 0; color: #6b7280; font-size: 14px;">Date & Time</p>
                    <p style="margin: 4px 0 0; color: #111827; font-size: 14px; font-weight: 600;">
                      ${formattedDate}
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding-bottom: 16px;">
                    <p style="margin: 0; color: #6b7280; font-size: 14px;">Cashier</p>
                    <p style="margin: 4px 0 0; color: #111827; font-size: 14px; font-weight: 600;">
                      ${data.cashierName}
                    </p>
                  </td>
                  <td style="padding-bottom: 16px; text-align: right;">
                    <p style="margin: 0; color: #6b7280; font-size: 14px;">Payment Method</p>
                    <p style="margin: 4px 0 0; color: #111827; font-size: 14px; font-weight: 600;">
                      ${getPaymentMethodLabel(data.paymentMethod)}
                    </p>
                  </td>
                </tr>
                ${
                  data.customerName || data.customerPhone
                    ? `
                <tr>
                  <td colspan="2" style="padding-bottom: 16px;">
                    <p style="margin: 0; color: #6b7280; font-size: 14px;">Customer</p>
                    <p style="margin: 4px 0 0; color: #111827; font-size: 14px; font-weight: 600;">
                      ${data.customerName || 'N/A'}${data.customerPhone ? ` - ${data.customerPhone}` : ''}
                    </p>
                  </td>
                </tr>
                `
                    : ''
                }
              </table>
            </td>
          </tr>

          <!-- Items Table -->
          <tr>
            <td style="padding: 0 32px 24px;">
              <table role="presentation" style="width: 100%; border-collapse: collapse; border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden;">
                <thead>
                  <tr style="background-color: #f9fafb;">
                    <th style="padding: 12px 8px; text-align: left; font-size: 12px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">
                      Item
                    </th>
                    <th style="padding: 12px 8px; text-align: center; font-size: 12px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">
                      Qty
                    </th>
                    <th style="padding: 12px 8px; text-align: right; font-size: 12px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">
                      Price
                    </th>
                    <th style="padding: 12px 8px; text-align: right; font-size: 12px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  ${itemsHtml}
                </tbody>
              </table>
            </td>
          </tr>

          <!-- Totals -->
          <tr>
            <td style="padding: 0 32px 32px;">
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; text-align: right; color: #6b7280; font-size: 14px;">
                    Subtotal:
                  </td>
                  <td style="padding: 8px 0 8px 24px; text-align: right; color: #111827; font-size: 14px; font-weight: 600; width: 120px;">
                    ${CurrencyUtil.format(data.subtotal, currencyCode)}
                  </td>
                </tr>
                ${
                  data.discount > 0
                    ? `
                <tr>
                  <td style="padding: 8px 0; text-align: right; color: #10b981; font-size: 14px;">
                    Discount:
                  </td>
                  <td style="padding: 8px 0 8px 24px; text-align: right; color: #10b981; font-size: 14px; font-weight: 600;">
                    -${CurrencyUtil.format(data.discount, currencyCode)}
                  </td>
                </tr>
                `
                    : ''
                }
                <tr style="border-top: 2px solid #e5e7eb;">
                  <td style="padding: 16px 0 0; text-align: right; color: #111827; font-size: 18px; font-weight: 700;">
                    Total:
                  </td>
                  <td style="padding: 16px 0 0 24px; text-align: right; color: #667eea; font-size: 24px; font-weight: 700;">
                    ${CurrencyUtil.format(data.total, currencyCode)}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px; background-color: #f9fafb; border-radius: 0 0 8px 8px; text-align: center;">
              <p style="margin: 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                Thank you for your purchase!<br>
                For any inquiries, please contact us at ${data.branchName}.
              </p>
              <p style="margin: 16px 0 0; color: #9ca3af; font-size: 12px;">
                This is an automated email. Please do not reply to this message.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}
