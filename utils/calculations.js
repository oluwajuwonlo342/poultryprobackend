/**
 * Computes Meat Bird FCR:
 * FCR = Total Feed Consumed (kg) / Total Live Weight Gain (kg)
 */
const calculateMeatFCR = ({
  totalFeedConsumedKg,
  currentPopulation,
  initialAvgWeightKg,
  latestAvgWeightKg,
  category,
}) => {
  if (category === 'Layers') return null; // Layers use feed per dozen eggs instead
  const weightGainPerBird = Math.max(0, latestAvgWeightKg - initialAvgWeightKg);
  const totalLiveWeightGainKg = weightGainPerBird * currentPopulation;
  if (totalLiveWeightGainKg <= 0 || totalFeedConsumedKg <= 0) return 0;
  return Number((totalFeedConsumedKg / totalLiveWeightGainKg).toFixed(2));
};

/**
 * Computes Layer Performance Metrics:
 * 1. Hen-Day Egg Production % = (Eggs Produced / Live Laying Hens) * 100
 * 2. Feed per Dozen Eggs (kg) = Total Feed Consumed (kg) / (Total Eggs / 12)
 */
const calculateLayerMetrics = ({ eggsProducedToday, liveHenCount, totalFeedKg, totalEggsPeriod }) => {
  const henDayPercent =
    liveHenCount > 0 ? Number(((eggsProducedToday / liveHenCount) * 100).toFixed(1)) : 0;
  const dozensProduced = totalEggsPeriod / 12;
  const feedPerDozenKg =
    dozensProduced > 0 ? Number((totalFeedKg / dozensProduced).toFixed(2)) : 0;

  return { henDayPercent, feedPerDozenKg };
};

/**
 * Computes Period Mortality Rate (%):
 * Mortality Rate = (Birds Lost in Period / Starting Population for Period) * 100
 */
const calculateMortalityRate = ({ birdsLost, startingPopulation }) => {
  if (!startingPopulation || startingPopulation <= 0) return 0;
  return Number(((birdsLost / startingPopulation) * 100).toFixed(2));
};

module.exports = {
  calculateMeatFCR,
  calculateLayerMetrics,
  calculateMortalityRate,
};