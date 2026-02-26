/**
 * Send email via Resend.
 * @param {Object} options - { to, subject, html }
 * @returns {Promise<{ success: boolean, id?: string, error?: string }>}
 */
const { fromEmail, resend, isConfigured } = require('../config');

async function sendEmail({ to, subject, html }) {
  if (!isConfigured || !resend) {
    console.warn('[Email] Resend not configured (RESEND_API_KEY missing). Skip sending.');
    return { success: false, error: 'Email not configured' };
  }
  if (!to || !subject || !html) {
    return { success: false, error: 'Missing to, subject, or html' };
  }
  try {
    const { data, error } = await resend.emails.send({
      from: fromEmail,
      to: Array.isArray(to) ? to : [to],
      subject,
      html
    });
    if (error) {
      console.error('[Email] Send failed:', error);
      return { success: false, error: error.message };
    }
    return { success: true, id: data?.id };
  } catch (err) {
    console.error('[Email] Send error:', err);
    return { success: false, error: err.message };
  }
}

module.exports = { sendEmail };
