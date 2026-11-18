const cron = require('node-cron');
const axios = require('axios');
const Vaccination = require('../models/Vaccination');
const Subscription = require('../models/Subscription');
const Notification = require('../models/Notification');
const Farm = require('../models/Farm');

/**
 * WhatsApp Business Cloud API Wrapper
 * Strictly verifies credentials before attempting delivery; never fakes success.
 */
const sendWhatsAppNotification = async ({ toPhone, message }) => {
  if (!process.env.WHATSAPP_PHONE_NUMBER_ID || !process.env.WHATSAPP_ACCESS_TOKEN) {
    return {
      sent: false,
      reason: 'WhatsApp Business API credentials not configured in environment variables.',
    };
  }

  try {
    const response = await axios.post(
      `${process.env.WHATSAPP_API_URL}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: 'whatsapp',
        to: toPhone.replace(/[^0-9]/g, ''),
        type: 'text',
        text: { body: message },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );
    return { sent: true, messageId: response.data?.messages?.[0]?.id };
  } catch (err) {
    return { sent: false, reason: err.response?.data?.error?.message || err.message };
  }
};

const initScheduler = () => {
  // Runs daily at 06:30 AM server time
  cron.schedule('30 6 * * *', async () => {
    try {
      const now = new Date();
      const twoDaysAhead = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);

      // 1. Mark overdue vaccinations
      await Vaccination.updateMany(
        { status: 'scheduled', scheduledDate: { $lt: now } },
        { $set: { status: 'overdue' } }
      );

      // 2. Send upcoming vaccination reminders
      const upcoming = await Vaccination.find({
        status: 'scheduled',
        reminderSent: false,
        scheduledDate: { $gte: now, $lte: twoDaysAhead },
      }).populate('batch', 'batchName');

      for (const vac of upcoming) {
        const farm = await Farm.findById(vac.farm);
        if (!farm) continue;

        await Notification.create({
          user: farm.owner,
          farm: farm._id,
          type: 'vaccination_reminder',
          title: `Upcoming Vaccination: ${vac.vaccineName}`,
          message: `Scheduled for batch "${vac.batch?.batchName}" on ${new Date(
            vac.scheduledDate
          ).toDateString()}.`,
          actionLink: '/dashboard/health',
        });

        vac.reminderSent = true;
        await vac.save();
      }

      // 3. Expire lapsed paid subscriptions
      await Subscription.updateMany(
        { planCode: { $ne: 'FREE' }, status: 'active', endDate: { $lt: now } },
        { $set: { status: 'expired' } }
      );
    } catch (err) {
      console.error('[Scheduler Error]:', err.message);
    }
  });
};

module.exports = { initScheduler, sendWhatsAppNotification };