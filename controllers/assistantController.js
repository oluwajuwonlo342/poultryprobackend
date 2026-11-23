const axios = require('axios');
const Batch = require('../models/Batch');
const FeedProduct = require('../models/FeedProduct');
const DailyRecord = require('../models/DailyRecord');
const EggProduction = require('../models/EggProduction');
const Sale = require('../models/Sale');
const Expense = require('../models/Expense');
const Vaccination = require('../models/Vaccination');

const askFarmAssistant = async (req, res, next) => {
  try {
    const { question } = req.body;
    if (!question || !question.trim()) {
      return res.status(400).json({ message: 'Please enter a question for the Smart Farm Assistant.' });
    }

    const cleanQuestion = question.trim();
    const lower = cleanQuestion.toLowerCase();

    // 1. Handle simple greetings immediately
    const greetingRegex = /^(hi|hello|hey|good morning|good afternoon|good evening|howdy|yo)[\s!.,?]*$/i;
    if (greetingRegex.test(cleanQuestion)) {
      return res.json({
        answer: `Hello ${req.user.fullName.split(' ')[0]}! 👋 I'm your PoultryPro Smart Farm Assistant for **${req.farm.name}**.\n\nAsk me anything about your live flock counts, feed stock, mortality trends, egg production, profit/loss, or general poultry management advice.`,
      });
    }

    // 2. Fetch live farm telemetry in parallel
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
    const totalFeedKg = feeds.reduce((sum, f) => sum + (f.currentStockKg || 0), 0);
    const lowFeeds = feeds.filter((f) => f.currentStockKg <= f.lowStockThresholdKg);
    const mortality7d = recentMortality.reduce((sum, r) => sum + (r.mortalityCount || 0), 0);
    const eggs7d = recentEggs.reduce((sum, e) => sum + (e.goodEggs || 0), 0);
    const cratesAvailable = Math.floor((req.farm.eggStockAvailable || 0) / 30);
    const totalRevenue = sales.reduce((sum, s) => sum + (s.totalAmount || 0), 0);
    const totalExpenses = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);

    // 3. Try Groq LLM if GROQ_API_KEY is configured (isolated try/catch so it never throws 404 to UI)
    const apiKey = process.env.GROQ_API_KEY?.trim();
    if (apiKey) {
      try {
        const farmContext = {
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

        const groqRes = await axios.post(
          'https://api.groq.com/openai/v1/chat/completions',
          {
            model: 'llama-3.1-8b-instant',
            temperature: 0.4,
            max_tokens: 500,
            messages: [
              {
                role: 'system',
                content: `You are PoultryPro AI, an expert poultry veterinarian, nutritionist, and farm business advisor for ${req.farm.name} in Nigeria.
Rules:
- Respond naturally, directly, and conversationally to what the user actually asked.
- Do NOT dump the entire farm database unless the user asks for an overview/summary.
- If the user asks about their farm, use the live JSON data below accurately (currency is Nigerian Naira ₦).
- If the user asks general poultry farming questions (e.g. brooding heat, coccidiosis, Lasota vaccine, feed formulation), give practical, actionable poultry advice.

Live Farm Data:
${JSON.stringify(farmContext)}`,
              },
              {
                role: 'user',
                content: cleanQuestion,
              },
            ],
          },
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            timeout: 12000,
          }
        );

        const aiReply = groqRes.data?.choices?.[0]?.message?.content;
        if (aiReply) {
          return res.json({ answer: aiReply.trim() });
        }
      } catch (groqErr) {
        console.error(
          '[Groq AI Error - Falling back to local engine]:',
          groqErr.response?.status,
          groqErr.response?.data || groqErr.message
        );
      }
    }

    // 4. Smart Intent-Based Fallback (runs cleanly if Groq is unavailable or key is invalid)
    if (lower.includes('bird') || lower.includes('flock') || lower.includes('batch') || lower.includes('how many')) {
      const batchLines =
        batches.length > 0
          ? batches.map((b) => `• ${b.batchName} (${b.category}): ${b.currentQuantity.toLocaleString()} birds`).join('\n')
          : '• No active batches recorded yet.';
      return res.json({
        answer: `You currently have **${totalBirds.toLocaleString()} live birds** across ${batches.length} active batch(es) on ${req.farm.name}:\n${batchLines}`,
      });
    }

    if (lower.includes('feed') || lower.includes('stock')) {
      const lowWarning =
        lowFeeds.length > 0
          ? `\n⚠️ Low stock alert: ${lowFeeds.map((f) => `${f.productName} (${f.currentStockKg} kg left)`).join(', ')}.`
          : '\nAll feed products are safely above their reorder thresholds.';
      return res.json({
        answer: `You have **${totalFeedKg.toLocaleString()} kg** of feed remaining in inventory.${lowWarning}`,
      });
    }

    if (lower.includes('egg') || lower.includes('crate')) {
      return res.json({
        answer: `You have **${cratesAvailable.toLocaleString()} crates** (${(req.farm.eggStockAvailable || 0).toLocaleString()} good eggs) available for sale, with **${eggs7d.toLocaleString()} good eggs** collected over the last 7 days.`,
      });
    }

    if (lower.includes('profit') || lower.includes('sales') || lower.includes('revenue') || lower.includes('expense') || lower.includes('money')) {
      const net = totalRevenue - totalExpenses;
      return res.json({
        answer: `Financial snapshot for **${req.farm.name}**:\n• Total Revenue: ₦${totalRevenue.toLocaleString()}\n• Total Expenses: ₦${totalExpenses.toLocaleString()}\n• Net Profit: ₦${net.toLocaleString()}`,
      });
    }

    if (lower.includes('mortality') || lower.includes('dead') || lower.includes('sick') || lower.includes('vaccine')) {
      return res.json({
        answer: `Recorded mortality over the last 7 days is **${mortality7d} bird(s)**, and you have **${upcomingVaccines.length}** scheduled vaccination(s) upcoming.`,
      });
    }

    return res.json({
      answer: `I can help you check your flock counts, feed stock, egg crates, mortality trends, or farm profit/loss—or answer poultry management questions. What would you like to know about **${req.farm.name}**?`,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { askFarmAssistant };
