const AssistantConversation = require('../models/AssistantConversation');
const Batch = require('../models/Batch');
const FeedProduct = require('../models/FeedProduct');
const DailyRecord = require('../models/DailyRecord');
const EggProduction = require('../models/EggProduction');
const Sale = require('../models/Sale');
const Expense = require('../models/Expense');
const Vaccination = require('../models/Vaccination');

const getAvailableGroqModels = async (apiKey) => {
  try {
    const res = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const allIds = (data.data || [])
      .map((m) => m.id)
      .filter((id) => id && !id.includes('whisper') && !id.includes('guard') && !id.includes('tts'));

    const preferredOrder = [
      'llama-3.3-70b-versatile',
      'meta-llama/llama-4-scout-17b-16e-instruct',
      'meta-llama/llama-4-maverick-17b-128e-instruct',
      'qwen/qwen3-32b',
      'llama-3.1-8b-instant',
      'gemma2-9b-it',
    ];

    return [
      ...preferredOrder.filter((id) => allIds.includes(id)),
      ...allIds.filter((id) => !preferredOrder.includes(id)),
    ];
  } catch {
    return [];
  }
};

const callGroqWithFallback = async (apiKey, messages) => {
  const discovered = await getAvailableGroqModels(apiKey);
  const models =
    discovered.length > 0
      ? discovered.slice(0, 4)
      : ['llama-3.3-70b-versatile', 'meta-llama/llama-4-scout-17b-16e-instruct', 'qwen/qwen3-32b'];

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

// List all saved conversations for the current user & active farm
const getConversations = async (req, res, next) => {
  try {
    const conversations = await AssistantConversation.find({
      user: req.user._id,
      farm: req.farmId,
    })
      .select('title updatedAt createdAt messages')
      .sort({ updatedAt: -1 })
      .limit(30);

    const formatted = conversations.map((c) => ({
      _id: c._id,
      title: c.title,
      messageCount: c.messages.length,
      updatedAt: c.updatedAt,
    }));

    res.json(formatted);
  } catch (error) {
    next(error);
  }
};

// Get a single saved conversation with full message history
const getConversationById = async (req, res, next) => {
  try {
    const conversation = await AssistantConversation.findOne({
      _id: req.params.id,
      user: req.user._id,
      farm: req.farmId,
    });

    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found.' });
    }

    res.json(conversation);
  } catch (error) {
    next(error);
  }
};

// Delete a saved conversation
const deleteConversation = async (req, res, next) => {
  try {
    const deleted = await AssistantConversation.findOneAndDelete({
      _id: req.params.id,
      user: req.user._id,
      farm: req.farmId,
    });

    if (!deleted) {
      return res.status(404).json({ message: 'Conversation not found.' });
    }

    res.json({ message: 'Conversation deleted.' });
  } catch (error) {
    next(error);
  }
};

// Ask AI and persist both user & assistant messages into MongoDB
const askFarmAssistant = async (req, res, next) => {
  try {
    const { question, conversationId } = req.body;
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

    // Load existing conversation or prepare a new one
    let conversation = null;
    if (conversationId) {
      conversation = await AssistantConversation.findOne({
        _id: conversationId,
        user: req.user._id,
        farm: req.farmId,
      });
    }

    if (!conversation) {
      const autoTitle =
        cleanQuestion.length > 42 ? `${cleanQuestion.slice(0, 42)}...` : cleanQuestion;
      conversation = new AssistantConversation({
        user: req.user._id,
        farm: req.farmId,
        title: autoTitle,
        messages: [],
      });
    }

    // Fetch live farm telemetry in parallel
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

    // Use the last 12 saved messages from this conversation for context
    const priorHistory = conversation.messages.slice(-12).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const messages = [
      { role: 'system', content: systemPrompt },
      ...priorHistory,
      { role: 'user', content: cleanQuestion },
    ];

    const { reply, error } = await callGroqWithFallback(groqKey, messages);

    if (!reply) {
      return res.json({
        answer: `⚠️ Groq API error: ${error}. Check your Groq Console → Settings → Limits/Models to confirm an active chat model is enabled for your key.`,
      });
    }

    // Save both turns to MongoDB
    conversation.messages.push(
      { role: 'user', content: cleanQuestion },
      { role: 'assistant', content: reply }
    );
    await conversation.save();

    return res.json({
      answer: reply,
      conversation: {
        _id: conversation._id,
        title: conversation.title,
        updatedAt: conversation.updatedAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  askFarmAssistant,
  getConversations,
  getConversationById,
  deleteConversation,
};