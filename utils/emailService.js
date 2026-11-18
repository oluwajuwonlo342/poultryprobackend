const axios = require('axios');

const sendEmail = async ({ to, subject, html, text }) => {
  if (!process.env.BREVO_API_KEY) {
    console.warn(`[EmailService] BREVO_API_KEY not configured. Skipped email to ${to}: "${subject}"`);
    return { sent: false, reason: 'BREVO_API_KEY not configured in .env' };
  }

  try {
    const senderEmail = process.env.BREVO_SENDER_EMAIL || 'noreply@poultrypro.ng';
    const senderName = process.env.BREVO_SENDER_NAME || 'PoultryPro';

    const payload = {
      sender: { name: senderName, email: senderEmail },
      to: [{ email: to }],
      subject,
      textContent: text || (html ? html.replace(/<[^>]+>/g, '') : ''),
      htmlContent: html || `<p>${text || ''}</p>`,
    };

    const response = await axios.post('https://api.brevo.com/v3/smtp/email', payload, {
      headers: {
        'api-key': process.env.BREVO_API_KEY,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 8000,
    });

    return { sent: true, messageId: response.data?.messageId };
  } catch (error) {
    const errMsg = error.response?.data?.message || error.message;
    console.error('[EmailService Error]:', errMsg);
    return { sent: false, reason: errMsg };
  }
};

module.exports = { sendEmail };