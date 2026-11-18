const axios = require('axios');
const Batch = require('../models/Batch');
const DailyRecord = require('../models/DailyRecord');
const EggProduction = require('../models/EggProduction');
const Sale = require('../models/Sale');
const Expense = require('../models/Expense');
const Vaccination = require('../models/Vaccination');

exports.askFarmAssistant = async (req, res, next) => {
  try {
    const { question } = req.body;
    if (!question?.trim()) {
      return res.status(400).json({ message: 'Please enter a question about your farm.' });
    }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [batches, weekFeedAgg, monthEggsAgg, monthExpensesAgg, monthSalesAgg, nextVac] =
      await Promise.all([
        Batch.find({ farm: req.farmId, status: 'active' }),
        DailyRecord.aggregate([
          {
            $match: {
              farm: req.farmId,
              recordType: 'feeding',
              recordDate: { $gte: sevenDaysAgo },
            },
          },
          { $group: { _id: null, kg: { $sum: '$feedQuantityKg' } } },
        ]),
        EggProduction.aggregate([
          { $match: { farm: req.farmId, productionDate: { $gte: thirtyDaysAgo } } },
          { $group: { _id: null, eggs: { $sum: '$totalCollected' } } },
        ]),
        Expense.aggregate([
          { $match: { farm: req.farmId, expenseDate: { $gte: thirtyDaysAgo } } },
          { $group: { _id: null, total: { $sum: '$amount' } } },
        ]),
        Sale.aggregate([
          { $match: { farm: req.farmId, salesDate: { $gte: thirtyDaysAgo } } },
          { $group: { _id: null, total: { $sum: '$totalAmount' } } },
        ]),
        Vaccination.findOne({ farm: req.farmId, status: 'scheduled' })
          .populate('batch', 'batchName')
          .sort({ scheduledDate: 1 }),
      ]);

    const totalBirds = batches.reduce((s, b) => s + b.currentQuantity, 0);
    const totalInitial = batches.reduce((s, b) => s + b.initialQuantity, 0);
    const totalLost = batches.reduce((s, b) => s + b.totalMortality, 0);
    const mortalityRate = totalInitial > 0 ? ((totalLost / totalInitial) * 100).toFixed(2) : '0.00';

    const highestMortalityBatch = [...batches].sort((a, b) => b.totalMortality - a.totalMortality)[0];

    const liveContext = {
      farmName: req.farm.name,
      totalActiveBirds: totalBirds,
      activeBatches: batches.map((b) => ({
        name: b.batchName,
        category: b.category,
        currentQuantity: b.currentQuantity,
        mortality: b.totalMortality,
      })),
      overallMortalityRatePercent: mortalityRate,
      highestMortalityBatch: highestMortalityBatch
        ? `${highestMortalityBatch.batchName} (${highestMortalityBatch.totalMortality} birds)`
        : 'None',
      feedConsumedLast7DaysKg: weekFeedAgg[0]?.kg || 0,
      eggsProducedLast30Days: monthEggsAgg[0]?.eggs || 0,
      expensesLast30DaysNGN: monthExpensesAgg[0]?.total || 0,
      revenueLast30DaysNGN: monthSalesAgg[0]?.total || 0,
      nextVaccination: nextVac
        ? `${nextVac.vaccineName} for ${nextVac.batch?.batchName} on ${new Date(
            nextVac.scheduledDate
          ).toDateString()}`
        : 'No upcoming scheduled vaccinations',
    };

    // Graceful deterministic fallback if OPENAI_API_KEY is not set
    if (!process.env.OPENAI_API_KEY) {
      return res.json({
        mode: 'live_data_fallback',
        answer: `Based on live records for **${liveContext.farmName}**:
• **Current Live Birds:** ${liveContext.totalActiveBirds.toLocaleString()} across ${batches.length} active batch(es)
• **Overall Mortality Rate:** ${liveContext.overallMortalityRatePercent}% (Highest: ${liveContext.highestMortalityBatch})
• **Feed Consumed (Last 7 Days):** ${liveContext.feedConsumedLast7DaysKg} kg
• **Eggs Produced (Last 30 Days):** ${liveContext.eggsProducedLast30Days.toLocaleString()} eggs
• **30-Day Revenue vs Expenses:** ₦${liveContext.revenueLast30DaysNGN.toLocaleString()} revenue / ₦${liveContext.expensesLast30DaysNGN.toLocaleString()} expenses
• **Next Vaccination:** ${liveContext.nextVaccination}`,
        snapshot: liveContext,
      });
    }

    // server/controllers/assistantController.js (lines 95-113)
const apiKey = process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY;
const apiUrl = process.env.GROQ_API_KEY
  ? 'https://api.groq.com/openai/v1/chat/completions'
  : 'https://api.openai.com/v1/chat/completions';
const modelName = process.env.GROQ_API_KEY ? 'llama-3.3-70b-versatile' : 'gpt-4o-mini';

if (!apiKey) {
  return res.json({ mode: 'live_data_fallback', answer: fallbackSummary, snapshot: liveContext });
}

const aiRes = await axios.post(
  apiUrl,
  {
    model: modelName,
    messages: [
      {
        role: 'system',
        content: `You are PoultryPro Smart Farm Assistant. Answer concisely using ONLY this farm data JSON (currency: ₦). Do not prescribe veterinary drugs. Data: ${JSON.stringify(liveContext)}`,
      },
      { role: 'user', content: question },
    ],
    temperature: 0.2,
  },
  { headers: { Authorization: `Bearer ${apiKey}` } }
);
    res.json({
      mode: 'ai_powered',
      answer: aiRes.data.choices[0].message.content,
      snapshot: liveContext,
    });
  } catch (error) {
    next(error);
  }
};