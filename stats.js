import express from "express";
import { getStats, getRecentEntries } from "../services/eventLog.js";
import { getModelStatus } from "../services/analyzer.js";
import { getStore, getIsRedis } from "../services/store.js";

const router = express.Router();

router.get("/stats", (req, res) => {
  res.json(getStats());
});

router.get("/stats/recent", (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  res.json({ entries: getRecentEntries(limit) });
});

router.get("/health", async (req, res) => {
  let storeStatus = "ok";
  try {
    const store = await getStore();
    await store.set("health:ping", "1", 5000);
    storeStatus = getIsRedis() ? "redis" : "memory";
  } catch {
    storeStatus = "error";
  }

  const model = getModelStatus();

  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    services: {
      store: storeStatus,
      tensorflowModel: model.tensorflowLoaded ? "loaded" : "fallback",
      fallbackMode: model.fallback,
    },
    uptime: Math.round(process.uptime()),
    memory: {
      heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + "MB",
      rss: Math.round(process.memoryUsage().rss / 1024 / 1024) + "MB",
    },
  });
});

module.exports = router;
