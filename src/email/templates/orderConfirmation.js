/**
 * Order confirmation email (sent when order is paid).
 * Uses ABSCOTEK scheme: primary #FF5059, dark bg #1F1F21.
 */
const { appName } = require('../config');

function getOrderConfirmationHtml({ orderNumber, buyerName, totalAmount, currency, orderId }) {
  const name = buyerName || 'Customer';
  const amount = typeof totalAmount === 'number' ? totalAmount.toLocaleString() : totalAmount;
  const orderRef = orderNumber || orderId || '—';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Order confirmed - ${appName}</title>
</head>
<body style="margin:0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #1F1F21;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#1F1F21;">
    <tr>
      <td align="center" style="padding: 32px 16px;">
        <table role="presentation" width="100%" style="max-width: 560px; border: 1px solid #2C2C2E; border-radius: 12px; overflow: hidden;">
          <tr>
            <td style="background: #2A2A2C; padding: 24px 24px 20px; border-bottom: 2px solid #FF5059;">
              <h1 style="margin:0; font-size: 22px; font-weight: 700; color: #FF5059; letter-spacing: 0.02em;">${appName}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 28px 24px; color: #dedede;">
              <p style="margin:0 0 16px; font-size: 16px; line-height: 1.5;">Hi ${name},</p>
              <p style="margin:0 0 24px; font-size: 16px; line-height: 1.5;">Your order has been confirmed and payment received.</p>
              <table role="presentation" width="100%" cellpadding="12" cellspacing="0" style="background: #2C2C2E; border-radius: 8px;">
                <tr>
                  <td style="color: #9a9a9a; font-size: 14px;">Order</td>
                  <td align="right" style="color: #dedede; font-size: 14px;">${orderRef}</td>
                </tr>
                <tr>
                  <td style="color: #9a9a9a; font-size: 14px;">Total</td>
                  <td align="right" style="color: #FF5059; font-size: 18px; font-weight: 600;">${amount} ${currency || 'USD'}</td>
                </tr>
              </table>
              <p style="margin: 24px 0 0; font-size: 14px; color: #9a9a9a;">Thank you for shopping with us.</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 16px 24px; background: #2A2A2C; border-top: 1px solid #2C2C2E;">
              <p style="margin:0; font-size: 12px; color: #6a6a6a;">&copy; ${new Date().getFullYear()} ${appName}. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

module.exports = { getOrderConfirmationHtml };
