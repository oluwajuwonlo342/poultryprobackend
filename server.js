require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const rateLimit = require('express-rate-limit');

const SubscriptionPlan = require('./models/SubscriptionPlan');
const { initScheduler } = require('./utils/scheduler');

const app = express();

// Security HTTP headers & sanitization
app.use(helmet());
app.use(mongoSanitize());
app.use(
  cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
  })
);

// Rate limiting on auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { message: 'Too many authentication attempts. Please try again in 15 minutes.' },
});

// Paystack Webhook needs raw body verification before express.json()
app.use('/api/billing/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// API Routes
app.use('/api/auth', authLimiter, require('./routes/authRoutes'));
app.use('/api/farms', require('./routes/farmRoutes'));
app.use('/api/batches', require('./routes/batchRoutes'));
app.use('/api/records', require('./routes/dailyRecordRoutes'));
app.use('/api/feed', require('./routes/feedRoutes'));
app.use('/api/health', require('./routes/healthRoutes'));
app.use('/api/eggs', require('./routes/eggRoutes'));
app.use('/api/sales', require('./routes/salesRoutes'));
app.use('/api/finance', require('./routes/financeRoutes'));
app.use('/api/reports', require('./routes/reportRoutes'));
app.use('/api/notifications', require('./routes/notificationRoutes'));
app.use('/api/assistant', require('./routes/assistantRoutes'));
app.use('/api/billing', require('./routes/billingRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));

app.get('/api/health-check', (req, res) => {
  res.json({ status: 'ok', service: 'PoultryPro API', timestamp: new Date().toISOString() });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('[PoultryPro Error]:', err);
  res.status(err.statusCode || 500).json({
    message: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// Seed default SaaS subscription plans if none exist
const seedSubscriptionPlans = async () => {
  const count = await SubscriptionPlan.countDocuments();
  if (count > 0) return;

  await SubscriptionPlan.insertMany([
    {
      code: 'FREE',
      name: 'Free Starter',
      description: 'Ideal for backyard and small-scale poultry farmers getting started.',
      monthlyPriceNGN: 0,
      annualPriceNGN: 0,
      limits: {
        maxFarms: 1,
        maxActiveBatchesPerFarm: 2,
        maxWorkers: 0,
        hasFinancialTracking: false,
        hasFeedInventory: false,
        hasAdvancedAnalytics: false,
        hasPdfExcelExport: false,
        hasSmartAssistant: false,
        hasAutomatedReminders: false,
      },
    },
    {
      code: 'STARTER',
      name: 'Starter Farm',
      description: 'Complete feed inventory and financial tracking for growing farms.',
      monthlyPriceNGN: 5000,
      annualPriceNGN: 50000,
      limits: {
        maxFarms: 1,
        maxActiveBatchesPerFarm: 6,
        maxWorkers: 2,
        hasFinancialTracking: true,
        hasFeedInventory: true,
        hasAdvancedAnalytics: false,
        hasPdfExcelExport: false,
        hasSmartAssistant: false,
        hasAutomatedReminders: true,
      },
    },
    {
      code: 'PROFESSIONAL',
      name: 'Professional Commercial',
      description: 'Multi-farm management, worker permissions, PDF/Excel reports, and AI Farm Assistant.',
      monthlyPriceNGN: 15000,
      annualPriceNGN: 150000,
      limits: {
        maxFarms: 3,
        maxActiveBatchesPerFarm: 25,
        maxWorkers: 10,
        hasFinancialTracking: true,
        hasFeedInventory: true,
        hasAdvancedAnalytics: true,
        hasPdfExcelExport: true,
        hasSmartAssistant: true,
        hasAutomatedReminders: true,
      },
    },
    {
      code: 'ENTERPRISE',
      name: 'Enterprise Agribusiness',
      description: 'Unlimited scale for commercial hatcheries, integrators, and multi-site poultry operations.',
      monthlyPriceNGN: 45000,
      annualPriceNGN: 450000,
      limits: {
        maxFarms: 999,
        maxActiveBatchesPerFarm: 999,
        maxWorkers: 100,
        hasFinancialTracking: true,
        hasFeedInventory: true,
        hasAdvancedAnalytics: true,
        hasPdfExcelExport: true,
        hasSmartAssistant: true,
        hasAutomatedReminders: true,
      },
    },
  ]);
  console.log('Default PoultryPro subscription plans seeded.');
};

const PORT = process.env.PORT || 5000;
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    console.log('MongoDB connected successfully.');
    await seedSubscriptionPlans();
    initScheduler();
    app.listen(PORT, () => console.log(`PoultryPro API running on port ${PORT}`));
  })
  .catch((err) => {
    console.error('MongoDB connection failed:', err.message);
    process.exit(1);
  });