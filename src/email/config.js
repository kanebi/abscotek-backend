/**
 * Email configuration (Resend).
 * Set RESEND_API_KEY and RESEND_FROM_EMAIL in .env.
 */
const { Resend } = require('resend');

const apiKey = process.env.RESEND_API_KEY || '';
const fromEmail = process.env.RESEND_FROM_EMAIL || process.env.FROM_EMAIL || 'orders@abscotek.io';
const appName = process.env.APP_NAME || 'ABSCOTEK';

const resend = apiKey ? new Resend(apiKey) : null;

module.exports = {
  resend,
  fromEmail,
  appName,
  isConfigured: !!apiKey
};
