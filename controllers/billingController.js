const crypto = require('crypto');
const axios = require('axios');
const SubscriptionPlan = require('../models/SubscriptionPlan');
const Subscription = require('../models/Subscription');
const Payment = require('../models/Payment');
const User = require('../models/User');

const activateSubscriptionForPayment = async (payment, gatewayData) => {
  if (payment.status === 'success') return; // Idempotency guard

  payment.status = 'success';
  payment.paidAt = new Date();
  payment.channel = gatewayData.channel || 'card';
  payment.gatewayResponse = gatewayData;
  await payment.save();

  const plan = await SubscriptionPlan.findById(payment.plan);
  const durationDays = payment.billingCycle === 'annual' ? 365 : 30;
  const endDate = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);

  await Subscription.findOneAndUpdate(
    { user: payment.user },
    {
      plan: plan._id,
      planCode: plan.code,
      billingCycle: payment.billingCycle,
      status: 'active',
      startDate: new Date(),
      endDate,
    },
    { upsert: true, new: true }
  );
};

exports.initializePaystackCheckout = async (req, res, next) => {
  try {
    const { planCode, billingCycle = 'monthly' } = req.body;
    const plan = await SubscriptionPlan.findOne({ code: planCode, isActive: true });
    if (!plan) return res.status(404).json({ message: 'Subscription plan not found.' });

    const amountNGN = billingCycle === 'annual' ? plan.annualPriceNGN : plan.monthlyPriceNGN;
    if (amountNGN <= 0) {
      return res.status(400).json({ message: 'Free plan does not require Paystack checkout.' });
    }

    if (!process.env.PAYSTACK_SECRET_KEY) {
      return res.status(503).json({
        message: 'Paystack credentials are not configured on the server. Add PAYSTACK_SECRET_KEY in .env.',
      });
    }

    const reference = `PPRO_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    await Payment.create({
      user: req.user._id,
      plan: plan._id,
      reference,
      amountNGN,
      billingCycle,
      status: 'pending',
    });

    const response = await axios.post(
      'https://api.paystack.co/transaction/initialize',
      {
        email: req.user.email,
        amount: amountNGN * 100, // Paystack expects Kobo
        reference,
        callback_url: `${process.env.CLIENT_URL}/dashboard/billing?reference=${reference}`,
        metadata: {
          userId: req.user._id.toString(),
          planCode: plan.code,
          billingCycle,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    res.json({
      authorizationUrl: response.data.data.authorization_url,
      reference,
    });
  } catch (error) {
    next(error);
  }
};

exports.verifyPaystackTransaction = async (req, res, next) => {
  try {
    const { reference } = req.params;
    const payment = await Payment.findOne({ reference, user: req.user._id });
    if (!payment) return res.status(404).json({ message: 'Payment record not found.' });

    const verifyRes = await axios.get(`https://api.paystack.co/transaction/verify/${reference}`, {
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
    });

    const txData = verifyRes.data.data;
    if (txData.status === 'success' && txData.amount >= payment.amountNGN * 100) {
      await activateSubscriptionForPayment(payment, txData);
      const updatedSub = await Subscription.findOne({ user: req.user._id }).populate('plan');
      return res.json({ status: 'success', subscription: updatedSub });
    }

    payment.status = 'failed';
    payment.gatewayResponse = txData;
    await payment.save();
    res.status(400).json({ status: 'failed', message: 'Transaction could not be verified as successful.' });
  } catch (error) {
    next(error);
  }
};

exports.handlePaystackWebhook = async (req, res) => {
  try {
    const hash = crypto
      .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY || '')
      .update(req.body)
      .digest('hex');

    if (hash !== req.headers['x-paystack-signature']) {
      return res.status(401).send('Invalid Paystack signature');
    }

    const event = JSON.parse(req.body.toString());
    if (event.event === 'charge.success') {
      const payment = await Payment.findOne({ reference: event.data.reference });
      if (payment) {
        await activateSubscriptionForPayment(payment, event.data);
      }
    }
    res.sendStatus(200);
  } catch (err) {
    console.error('Paystack Webhook Error:', err.message);
    res.sendStatus(500);
  }
};