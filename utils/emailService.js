const nodemailer = require('nodemailer');

const sendEmail = async ({ to, subject, html, text }) => {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.warn(`[EmailService] SMTP not configured. Skipped email to ${to}: "${subject}"`);
    return { sent: false, reason: 'SMTP credentials not configured in .env' };
  }

  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM || `"PoultryPro" <${process.env.SMTP_USER}>`,
      to,
      subject,
      text: text || html.replace(/<[^>]+>/g, ''),
      html,
    });

    return { sent: true, messageId: info.messageId };
  } catch (error) {
    console.error('[EmailService Error]:', error.message);
    return { sent: false, reason: error.message };
  }
};

module.exports = { sendEmail };