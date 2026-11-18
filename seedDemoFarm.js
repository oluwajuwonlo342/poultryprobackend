const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const mongoose = require('mongoose');

const User = require('./models/User');
const Farm = require('./models/Farm');
const FarmMembership = require('./models/FarmMembership');
const Batch = require('./models/Batch');
const FeedProduct = require('./models/FeedProduct');
const FeedTransaction = require('./models/FeedTransaction');
const DailyRecord = require('./models/DailyRecord');
const WeightRecord = require('./models/WeightRecord');
const Vaccination = require('./models/Vaccination');
const EggProduction = require('./models/EggProduction');
const Sale = require('./models/Sale');
const Expense = require('./models/Expense');
const SubscriptionPlan = require('./models/SubscriptionPlan');
const Subscription = require('./models/Subscription');

const seedDemoData = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB for demo seeding...');

    // 1. Clean existing demo accounts if re-running
    const demoEmails = ['admin@poultrypro.ng', 'demo@poultrypro.ng', 'worker@poultrypro.ng'];
    const existingUsers = await User.find({ email: { $in: demoEmails } });
    const existingUserIds = existingUsers.map((u) => u._id);

    if (existingUserIds.length > 0) {
      const existingFarms = await Farm.find({ owner: { $in: existingUserIds } });
      const farmIds = existingFarms.map((f) => f._id);

      await Promise.all([
        Batch.deleteMany({ farm: { $in: farmIds } }),
        FeedProduct.deleteMany({ farm: { $in: farmIds } }),
        FeedTransaction.deleteMany({ farm: { $in: farmIds } }),
        DailyRecord.deleteMany({ farm: { $in: farmIds } }),
        WeightRecord.deleteMany({ farm: { $in: farmIds } }),
        Vaccination.deleteMany({ farm: { $in: farmIds } }),
        EggProduction.deleteMany({ farm: { $in: farmIds } }),
        Sale.deleteMany({ farm: { $in: farmIds } }),
        Expense.deleteMany({ farm: { $in: farmIds } }),
        FarmMembership.deleteMany({ farm: { $in: farmIds } }),
        Farm.deleteMany({ _id: { $in: farmIds } }),
        Subscription.deleteMany({ user: { $in: existingUserIds } }),
        User.deleteMany({ _id: { $in: existingUserIds } }),
      ]);
      console.log('Cleared previous demo records.');
    }

    // 2. Ensure Subscription Plans exist
    let proPlan = await SubscriptionPlan.findOne({ code: 'PROFESSIONAL' });
    if (!proPlan) {
      proPlan = await SubscriptionPlan.create({
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
      });
    }

    // 3. Create Super Admin, Farm Owner, and Farm Worker
    const superAdmin = await User.create({
      fullName: 'PoultryPro Super Admin',
      email: 'admin@poultrypro.ng',
      phone: '+2348000000001',
      password: 'Password123!',
      role: 'super_admin',
      isEmailVerified: true,
    });

    const owner = await User.create({
      fullName: 'Adewale Ogunleye',
      email: 'demo@poultrypro.ng',
      phone: '+2348031234567',
      password: 'Password123!',
      role: 'farm_owner',
      isEmailVerified: true,
    });

    const worker = await User.create({
      fullName: 'Chinedu Okafor',
      email: 'worker@poultrypro.ng',
      phone: '+2348059876543',
      password: 'Password123!',
      role: 'farm_worker',
      isEmailVerified: true,
    });

    await Subscription.create({
      user: owner._id,
      plan: proPlan._id,
      planCode: 'PROFESSIONAL',
      billingCycle: 'monthly',
      status: 'active',
      startDate: new Date(),
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    // 4. Create Commercial Demo Farm
    const farm = await Farm.create({
      owner: owner._id,
      name: 'GreenPasture Commercial Farms',
      location: 'Ibadan, Oyo State',
      address: 'KM 12, Moniya-Iseyin Expressway, Akinyele LGA, Ibadan',
      farmType: 'Mixed Poultry',
      farmSize: '3 Acres (10,000 Bird Capacity)',
      poultryHousesCount: 4,
      contactPhone: '+2348031234567',
      contactEmail: 'demo@poultrypro.ng',
      eggStockAvailable: 1350, // 45 crates ready for sale
    });

    await FarmMembership.create({
      farm: farm._id,
      user: worker._id,
      invitedBy: owner._id,
      jobTitle: 'Senior Pen Supervisor',
      permissions: {
        recordFeeding: true,
        recordWater: true,
        recordMortality: true,
        recordEggs: true,
        recordHealth: true,
        viewBatches: true,
        manageInventory: true,
        viewFinancials: false,
        manageSales: false,
      },
      status: 'active',
    });

    // 5. Create Feed Inventory Products
    const broilerFinisher = await FeedProduct.create({
      farm: farm._id,
      productName: 'Ultima Broiler Finisher Pellet',
      feedType: 'Finisher',
      manufacturer: 'Ultima Feeds',
      unit: 'kg',
      currentStockKg: 850,
      lowStockThresholdKg: 200,
      weightedAvgCostPerKg: 760,
      supplier: 'Bodija Agro Feed Depot',
    });

    const layerMash = await FeedProduct.create({
      farm: farm._id,
      productName: 'Top Feeds Premium Layer Mash',
      feedType: 'Layer Mash',
      manufacturer: 'Premier Feed Mills',
      unit: 'kg',
      currentStockKg: 140, // Intentionally below threshold (200kg) to trigger Low Stock Alert on dashboard
      lowStockThresholdKg: 200,
      weightedAvgCostPerKg: 680,
      supplier: 'Challenge Livestock Supply',
    });

    await FeedTransaction.insertMany([
      {
        farm: farm._id,
        feedProduct: broilerFinisher._id,
        transactionType: 'purchase',
        quantityKg: 1500,
        unitCostPerKg: 760,
        totalCost: 1140000,
        supplier: 'Bodija Agro Feed Depot',
        transactionDate: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000),
        notes: 'Bulk finisher feed restock',
        recordedBy: owner._id,
      },
      {
        farm: farm._id,
        feedProduct: layerMash._id,
        transactionType: 'purchase',
        quantityKg: 1200,
        unitCostPerKg: 680,
        totalCost: 816000,
        supplier: 'Challenge Livestock Supply',
        transactionDate: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000),
        notes: 'Layer mash restock',
        recordedBy: owner._id,
      },
    ]);

    // 6. Create Active Broiler & Layer Batches
    const twentyEightDaysAgo = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    const broilerBatch = await Batch.create({
      farm: farm._id,
      batchName: 'Ross 308 Broiler Cycle A',
      batchCode: 'BCH-BRL-101',
      category: 'Broilers',
      breed: 'Ross 308',
      initialQuantity: 1000,
      currentQuantity: 978,
      totalMortality: 22,
      purchaseDate: twentyEightDaysAgo,
      arrivalDate: twentyEightDaysAgo,
      ageAtArrivalDays: 1,
      initialAvgWeightKg: 0.045,
      latestAvgWeightKg: 1.65,
      supplier: 'Agrited Hatcheries Ibadan',
      purchaseCost: 950000,
      housingLocation: 'Pen House 1',
      status: 'active',
      populationHistory: [
        {
          date: twentyEightDaysAgo,
          type: 'initial',
          quantityChange: 1000,
          balanceAfter: 1000,
          reason: 'Day-old chick stocking',
          recordedBy: owner._id,
        },
        {
          date: new Date(),
          type: 'mortality',
          quantityChange: -22,
          balanceAfter: 978,
          reason: 'Cumulative brooding & heat mortality',
          recordedBy: worker._id,
        },
      ],
    });

    const layerBatch = await Batch.create({
      farm: farm._id,
      batchName: 'Isa Brown Point-of-Lay Flock',
      batchCode: 'BCH-LYR-204',
      category: 'Layers',
      breed: 'Isa Brown',
      initialQuantity: 1500,
      currentQuantity: 1485,
      totalMortality: 15,
      purchaseDate: ninetyDaysAgo,
      arrivalDate: ninetyDaysAgo,
      ageAtArrivalDays: 112,
      initialAvgWeightKg: 1.45,
      latestAvgWeightKg: 1.82,
      supplier: 'CHI Farms Ajanla',
      purchaseCost: 4800000,
      housingLocation: 'Battery Cage House 2 & 3',
      status: 'active',
      populationHistory: [
        {
          date: ninetyDaysAgo,
          type: 'initial',
          quantityChange: 1500,
          balanceAfter: 1500,
          reason: 'Point-of-lay pullet arrival',
          recordedBy: owner._id,
        },
      ],
    });

    await WeightRecord.create({
      farm: farm._id,
      batch: broilerBatch._id,
      measurementDate: new Date(),
      birdsSampled: 50,
      averageWeightKg: 1.65,
      calculatedFCR: 1.59,
      notes: 'Week 4 average live weight check',
      recordedBy: worker._id,
    });

    // 7. Generate 10 Days of Time-Series Daily Records & Egg Production (for Recharts)
    const dailyRecordsBatch = [];
    const eggRecordsBatch = [];

    for (let i = 9; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(9, 0, 0, 0);

      const broilerFeed = 115 + i * 2;
      const layerFeed = 165;
      const dailyLoss = i % 3 === 0 ? 1 : 0;

      dailyRecordsBatch.push(
        {
          farm: farm._id,
          batch: broilerBatch._id,
          recordDate: date,
          recordType: 'feeding',
          feedProduct: broilerFinisher._id,
          feedType: broilerFinisher.productName,
          feedCategory: 'Finisher',
          feedQuantityKg: broilerFeed,
          feedCostSnapshot: broilerFeed * 760,
          recordedBy: worker._id,
        },
        {
          farm: farm._id,
          batch: layerBatch._id,
          recordDate: date,
          recordType: 'feeding',
          feedProduct: layerMash._id,
          feedType: layerMash.productName,
          feedCategory: 'Layer Mash',
          feedQuantityKg: layerFeed,
          feedCostSnapshot: layerFeed * 680,
          recordedBy: worker._id,
        },
        {
          farm: farm._id,
          batch: broilerBatch._id,
          recordDate: date,
          recordType: 'water',
          waterLitres: 240 + i * 5,
          recordedBy: worker._id,
        }
      );

      if (dailyLoss > 0) {
        dailyRecordsBatch.push({
          farm: farm._id,
          batch: broilerBatch._id,
          recordDate: date,
          recordType: 'mortality',
          mortalityCount: dailyLoss,
          suspectedCause: 'Afternoon heat stress',
          recordedBy: worker._id,
        });
      }

      const collected = 1260 + (i % 4) * 18; // ~85% Hen-Day rate on 1,485 hens
      const cracked = 8;
      const broken = 4;
      eggRecordsBatch.push({
        farm: farm._id,
        batch: layerBatch._id,
        productionDate: date,
        totalCollected: collected,
        goodEggs: collected - cracked - broken,
        crackedEggs: cracked,
        brokenEggs: broken,
        liveHenCountSnapshot: 1485,
        henDayPercentage: Number(((collected / 1485) * 100).toFixed(1)),
        recordedBy: worker._id,
      });
    }

    await DailyRecord.insertMany(dailyRecordsBatch);
    await EggProduction.insertMany(eggRecordsBatch);

    // 8. Create Upcoming & Completed Vaccinations
    await Vaccination.insertMany([
      {
        farm: farm._id,
        batch: broilerBatch._id,
        vaccineName: 'Gumboro (IBD) Booster',
        scheduledDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
        administrationDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
        dosage: '1,000 doses in 15L chlorine-free water',
        administrationMethod: 'Drinking Water',
        status: 'completed',
        personResponsible: worker._id,
      },
      {
        farm: farm._id,
        batch: broilerBatch._id,
        vaccineName: 'Newcastle Disease (Lasota)',
        scheduledDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
        dosage: '1,000 doses via drinking water',
        administrationMethod: 'Drinking Water',
        status: 'scheduled',
        personResponsible: worker._id,
      },
      {
        farm: farm._id,
        batch: layerBatch._id,
        vaccineName: 'NDV Komarov / EDS Oil Emulsion',
        scheduledDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
        dosage: '0.5ml per bird intramuscular',
        administrationMethod: 'Intramuscular Injection',
        status: 'scheduled',
        personResponsible: owner._id,
      },
    ]);

    // 9. Create Sales & Expenses for Realistic Net Profit Calculations
    await Sale.insertMany([
      {
        farm: farm._id,
        batch: layerBatch._id,
        receiptNumber: 'RCP-2026-A101',
        productCategory: 'Eggs',
        customerName: 'Mama Tunde Wholesale Depot',
        customerPhone: '+2348023456789',
        quantity: 180,
        unitLabel: 'crates',
        unitPrice: 4600,
        totalAmount: 828000,
        amountPaid: 828000,
        balanceDue: 0,
        paymentMethod: 'Bank Transfer',
        paymentStatus: 'paid',
        salesDate: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
        recordedBy: owner._id,
      },
      {
        farm: farm._id,
        batch: layerBatch._id,
        receiptNumber: 'RCP-2026-A102',
        productCategory: 'Eggs',
        customerName: 'Savory Bakery & Confectionery',
        customerPhone: '+2348098765432',
        quantity: 120,
        unitLabel: 'crates',
        unitPrice: 4700,
        totalAmount: 564000,
        amountPaid: 400000,
        balanceDue: 164000,
        paymentMethod: 'Bank Transfer',
        paymentStatus: 'partial',
        salesDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
        recordedBy: owner._id,
      },
      {
        farm: farm._id,
        batch: broilerBatch._id,
        receiptNumber: 'RCP-2026-A103',
        productCategory: 'Live Birds',
        customerName: 'Alhaji Musa Coldroom',
        customerPhone: '+2348071112233',
        quantity: 150,
        unitLabel: 'birds',
        unitPrice: 6500,
        totalAmount: 975000,
        amountPaid: 975000,
        balanceDue: 0,
        paymentMethod: 'Cash',
        paymentStatus: 'paid',
        salesDate: new Date(),
        recordedBy: owner._id,
      },
    ]);

    await Expense.insertMany([
      {
        farm: farm._id,
        batch: broilerBatch._id,
        title: 'Day-Old Chicks Stocking (1,000 Ross 308)',
        category: 'Bird Purchases',
        amount: 950000,
        expenseDate: twentyEightDaysAgo,
        paymentMethod: 'Bank Transfer',
        recordedBy: owner._id,
      },
      {
        farm: farm._id,
        title: 'Bulk Feed Procurement (Finisher & Layer Mash)',
        category: 'Feed Purchases',
        amount: 680000,
        expenseDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
        paymentMethod: 'Bank Transfer',
        recordedBy: owner._id,
      },
      {
        farm: farm._id,
        title: 'Pen Attendant Monthly Wages & Generator Diesel',
        category: 'Labour',
        amount: 145000,
        expenseDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        paymentMethod: 'Cash',
        recordedBy: owner._id,
      },
    ]);

    console.log('\n==================================================');
    console.log('PoultryPro Demo Data Seeded Successfully!');
    console.log('--------------------------------------------------');
    console.log('Farm Owner Login:  demo@poultrypro.ng   / Password123!');
    console.log('Farm Worker Login: worker@poultrypro.ng / Password123!');
    console.log('Super Admin Login: admin@poultrypro.ng  / Password123!');
    console.log('==================================================\n');

    process.exit(0);
  } catch (err) {
    console.error('Seed failed:', err);
    process.exit(1);
  }
};

seedDemoData();