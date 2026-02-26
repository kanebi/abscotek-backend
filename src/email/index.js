/**
 * Email module: order confirmation and order status change.
 * All templates and Resend config live under src/email/.
 */
const { sendEmail } = require('./utils/sendEmail');
const { getOrderConfirmationHtml } = require('./templates/orderConfirmation');
const { getOrderStatusChangeHtml, STATUS_LABELS } = require('./templates/orderStatusChange');
const { appName } = require('./config');

/**
 * Send order confirmation email (when order is paid).
 * @param {Object} order - Order doc with buyer populated { email, name }, orderNumber, totalAmount, currency
 */
async function sendOrderConfirmationEmail(order) {
  const buyer = order.buyer || {};
  const email = buyer.email;
  if (!email) return { success: false, error: 'No buyer email' };

  const html = getOrderConfirmationHtml({
    orderNumber: order.orderNumber,
    buyerName: buyer.name,
    totalAmount: order.totalAmount,
    currency: order.currency,
    orderId: order._id?.toString()
  });

  return sendEmail({
    to: email,
    subject: `Order confirmed – ${appName}`,
    html
  });
}

/**
 * Send order status change email (processing, shipped, delivered only).
 * @param {Object} order - Order doc with buyer populated
 * @param {string} newStatus - processing | shipped | delivered
 * @param {string} [previousStatus] - optional
 */
async function sendOrderStatusChangeEmail(order, newStatus, previousStatus) {
  const statusLower = (newStatus || '').toLowerCase();
  if (!STATUS_LABELS[statusLower]) return { success: false, error: 'Status not applicable for email' };

  const buyer = order.buyer || {};
  const email = buyer.email;
  if (!email) return { success: false, error: 'No buyer email' };

  const html = getOrderStatusChangeHtml({
    orderNumber: order.orderNumber,
    buyerName: buyer.name,
    newStatus: statusLower,
    trackingNumber: order.trackingNumber,
    orderId: order._id?.toString()
  });

  return sendEmail({
    to: email,
    subject: `Order ${STATUS_LABELS[statusLower]} – ${appName}`,
    html
  });
}

module.exports = {
  sendOrderConfirmationEmail,
  sendOrderStatusChangeEmail,
  sendEmail,
  getOrderConfirmationHtml,
  getOrderStatusChangeHtml,
  STATUS_LABELS
};
