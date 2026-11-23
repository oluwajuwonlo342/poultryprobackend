const Batch = require('../models/Batch');
const FeedProduct = require('../models/FeedProduct');
const DailyRecord = require('../models/DailyRecord');
const EggProduction = require('../models/EggProduction');
const Sale = require('../models/Sale');
const Expense = require('../models/Expense');
const Vaccination = require('../models/Vaccination');

const callGroqWithFallback = async (apiKey, messages) => {
  const models = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'];
  let lastError = 'Unknown Groq error';

  for (const model of models) {
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          temperature: 0.6,
          max_tokens: 800,
          messages,
        }),
      });

      const data = await response.json();

      if (response.ok && data?.choices?.[0]?.message?.content) {
        return { reply: data.choices[0].message.content.trim(), error: null };
      }

      lastError = data?.error?.message || `HTTP ${response.status}`;
      console.error(`[Groq ${model} failed]:`, lastError);
    } catch (err) {
      lastError = err.message;
      console.error(`[Groq ${model} network error]:`, lastError);
    }
  }

  return { reply: null, error: lastError };
};

const askFarmAssistant = async (req, res, next) => {
  try {
    const { question, history = [] } = req.body;
    if (!question || !question.trim()) {
      return res.status(400).json({ message: 'Please enter a message for the assistant.' });
    }

    const cleanQuestion = question.trim();
    const groqKey = (process.env.GROQ_API_KEY || '').replace(/^["']|["']$/g, '').trim();

    if (!groqKey) {
      return res.json({
        answer:
          '⚠️ `GROQ_API_KEY` was not found in `process.env` on this backend service. Make sure it is added under your **Backend Web Service → Environment** on Render and redeployed.',
      });
    }

    // Fetch live farm telemetry in parallel so the AI has accurate context
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [batches, feeds, recentMortality, recentEggs, sales, expenses, upcomingVaccines] =
      await Promise.all([
        Batch.find({ farm: req.farmId, status: 'active' }),
        FeedProduct.find({ farm: req.farmId }),
        DailyRecord.find({
          farm: req.farmId,
          recordType: 'mortality',
          recordDate: { $gte: sevenDaysAgo },
        }),
        EggProduction.find({
          farm: req.farmId,
          productionDate: { $gte: sevenDaysAgo },
        }),
        Sale.find({ farm: req.farmId }),
        Expense.find({ farm: req.farmId }),
        Vaccination.find({ farm: req.farmId, status: 'scheduled' }).populate('batch', 'batchName'),
      ]);

    const totalBirds = batches.reduce((sum, b) => sum + (b.currentQuantity || 0), 0);
    const mortality7d = recentMortality.reduce((sum, r) => sum + (r.mortalityCount || 0), 0);
    const eggs7d = recentEggs.reduce((sum, e) => sum + (e.goodEggs || 0), 0);
    const cratesAvailable = Math.floor((req.farm.eggStockAvailable || 0) / 30);
    const totalRevenue = sales.reduce((sum, s) => sum + (s.totalAmount || 0), 0);
    const totalExpenses = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);

    const farmContext = {
      ownerName: req.user.fullName,
      farmName: req.farm.name,
      farmType: req.farm.farmType,
      location: req.farm.location,
      totalLiveBirds: totalBirds,
      activeBatches: batches.map((b) => ({
        name: b.batchName,
        category: b.category,
        breed: b.breed,
        liveBirds: b.currentQuantity,
        mortality: b.totalMortality,
        latestWeightKg: b.latestAvgWeightKg,
      })),
      feedInventory: feeds.map((f) => ({
        name: f.productName,
        type: f.feedType,
        remainingKg: f.currentStockKg,
        lowStockThresholdKg: f.lowStockThresholdKg,
      })),
      last7DaysMortality: mortality7d,
      last7DaysGoodEggs: eggs7d,
      saleableEggCrates: cratesAvailable,
      totalRevenueNGN: totalRevenue,
      totalExpensesNGN: totalExpenses,
      netProfitNGN: totalRevenue - totalExpenses,
      upcomingVaccinations: upcomingVaccines.map((v) => ({
        vaccine: v.vaccineName,
        batch: v.batch?.batchName,
        date: v.scheduledDate,
      })),
    };

    const systemPrompt = `You are a helpful, intelligent, conversational AI assistant built into PoultryPro for ${req.farm.name} in Nigeria.
Act like a natural, smart AI assistant:
- Answer ANY question the user asks naturally—whether it's casual conversation, general knowledge, business math, poultry farming/veterinary advice, or specific questions about their farm.
- Do NOT dump raw farm statistics unless the user asks about their farm, birds, feed, eggs, or finances.
- When they DO ask about their farm, use the live JSON context below accurately (currency is Naira ₦).
- Keep answers clear, well-structured, and conversational.

Live Farm Context:
${JSON.stringify(farmContext)}`;

    const formattedHistory = Array.isArray(history)
      ? history
          .slice(-10)
          .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
          .map((m) => ({ role: m.role, content: m.content }))
      : [];

    const messages = [
      { role: 'system', content: systemPrompt },
      ...formattedHistory,
      { role: 'user', content: cleanQuestion },
    ];

    const { reply, error } = await callGroqWithFallback(groqKey, messages);

    if (reply) {
      return res.json({ answer: reply });
    }

    return res.json({
      answer: `⚠️ Groq API error: ${error}. Please verify your GROQ_API_KEY in Render Environment Variables.`,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { askFarmAssistant };
