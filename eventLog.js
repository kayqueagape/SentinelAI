const MAX_ENTRIES = 500;
const entries = [];
let totalAnalyzed = 0;
let totalToxic = 0;

const BUCKETS = 60;
const buckets = Array.from({ length: BUCKETS }, () => ({
  ts: 0, count: 0, toxic: 0, avgTemp: 0, sumTemp: 0,
}));

function getCurrentBucketIndex() {
  return Math.floor(Date.now() / 60_000) % BUCKETS;
}

function addEntry(entry) {
  totalAnalyzed++;
  if (entry.analysis.toxicity.isToxic) totalToxic++;

  entries.push(entry);
  if (entries.length > MAX_ENTRIES) entries.shift();

  const idx = getCurrentBucketIndex();
  const nowMinute = Math.floor(Date.now() / 60_000) * 60_000;

  if (buckets[idx].ts !== nowMinute) {
    buckets[idx] = { ts: nowMinute, count: 0, toxic: 0, avgTemp: 0, sumTemp: 0 };
  }

  buckets[idx].count++;
  if (entry.analysis.toxicity.isToxic) buckets[idx].toxic++;
  buckets[idx].sumTemp += entry.analysis.temperature;
  buckets[idx].avgTemp = Math.round(buckets[idx].sumTemp / buckets[idx].count);
}

function getRecentEntries(limit = 50) {
  return entries.slice(-limit).reverse();
}

function getStats() {
  const recent = entries.slice(-100);
  const avgTemperature = recent.length
    ? Math.round(recent.reduce((s, e) => s + e.analysis.temperature, 0) / recent.length)
    : 0;

  const sentimentDist = { very_positive: 0, positive: 0, neutral: 0, negative: 0, very_negative: 0 };
  const categoryDist = {};

  for (const e of recent) {
    const s = e.analysis.sentiment.label;
    if (sentimentDist[s] !== undefined) sentimentDist[s]++;
    for (const cat of e.analysis.categories) {
      categoryDist[cat] = (categoryDist[cat] || 0) + 1;
    }
  }

  const toxicRate = totalAnalyzed > 0 ? Math.round((totalToxic / totalAnalyzed) * 100) : 0;

  const timeline = [];
  for (let i = BUCKETS - 1; i >= 0; i--) {
    const idx = (getCurrentBucketIndex() - i + BUCKETS) % BUCKETS;
    const b = buckets[idx];
    if (b.count > 0) {
      timeline.unshift({
        ts: b.ts,
        label: new Date(b.ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
        count: b.count,
        toxic: b.toxic,
        avgTemp: b.avgTemp,
      });
    }
  }

  return {
    totalAnalyzed,
    totalToxic,
    toxicRate,
    avgTemperature,
    sentimentDistribution: sentimentDist,
    categoryDistribution: categoryDist,
    timeline,
  };
}

module.exports = { addEntry, getRecentEntries, getStats };
