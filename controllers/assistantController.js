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
    const { question, history = [] } = req.body;
    if (!question || !question.trim()) {
      return res.status(400).json({ message: 'Please enter a message for the assistant.' });
    }

    const cleanQuestion = question.trim();

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

    // Sanitize prior chat turns (keep last 10 messages)
    const formattedHistory = Array.isArray(history)
      ? history
          .slice(-10)
          .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
          .map((m) => ({ role: m.role, content: m.content }))
      : [];

    const groqKey = process.env.GROQ_API_KEY?.trim();
    const openaiKey = process.env.OPENAI_API_KEY?.trim();
    const geminiKey = process.env.GEMINI_API_KEY?.trim();

    // Option A: Groq (Free & ultra-fast Llama 3.3 70B)
    if (groqKey) {
      try {
        const groqRes = await axios.post(
          'https://api.groq.com/openai/v1/chat/completions',
          {
            model: 'llama-3.3-70b-versatile',
            temperature: 0.6,
            max_tokens: 800,
            messages: [
              { role: 'system', content: systemPrompt },
              ...formattedHistory,
              { role: 'user', content: cleanQuestion },
            ],
          },
          {
            headers: {
              Authorization: `Bearer ${groqKey}`,
              'Content-Type': 'application/json',
            },
            timeout: 15000,
          }
        );

        const reply = groqRes.data?.choices?.[0]?.message?.content;
        if (reply) return res.json({ answer: reply.trim() });
      } catch (err) {
        console.error('[Groq AI Error]:', err.response?.status, err.response?.data || err.message);
      }
    }

    // Option B: OpenAI (if OPENAI_API_KEY is set instead)
    if (openaiKey) {
      try {
        const openaiRes = await axios.post(
          'https://api.openai.com/v1/chat/completions',
          {
            model: 'gpt-4o-mini',
            temperature: 0.6,
            max_tokens: 800,
            messages: [
              { role: 'system', content: systemPrompt },
              ...formattedHistory,
              { role: 'user', content: cleanQuestion },
            ],
          },
          {
            headers: {
              Authorization: `Bearer ${openaiKey}`,
              'Content-Type': 'application/json',
            },
            timeout: 15000,
          }
        );

        const reply = openaiRes.data?.choices?.[0]?.message?.content;
        if (reply) return res.json({ answer: reply.trim() });
      } catch (err) {
        console.error('[OpenAI Error]:', err.response?.status, err.response?.data || err.message);
      }
    }

    // Option C: Google Gemini (if GEMINI_API_KEY is set instead)
    if (geminiKey) {
      try {
        const contents = [
          ...formattedHistory.map((m) => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }],
          })),
          { role: 'user', parts: [{ text: cleanQuestion }] },
        ];

        const geminiRes = await axios.post(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
          {
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents,
          },
          { timeout: 15000 }
        );

        const reply = geminiRes.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (reply) return res.json({ answer: reply.trim() });
      } catch (err) {
        console.error('[Gemini AI Error]:', err.response?.status, err.response?.data || err.message);
      }
    }

    // If no valid AI API key is active on Render, tell the admin clearly instead of faking an AI
    return res.json({
      answer:
        '⚠️ Live AI is not connected yet because no valid `GROQ_API_KEY`, `OPENAI_API_KEY`, or `GEMINI_API_KEY` is active in your Render server environment variables. Add one of those keys on Render and redeploy to enable full conversational AI.',
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { askFarmAssistant };
