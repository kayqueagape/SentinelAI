import { configDotenv } from "dotenv"

module.exports = {
  port: parseInt(process.env.PORT) || 3000,
  nodeEnv: process.env.NODE_ENV || "development",

  redis: {
    url: process.env.REDIS_URL || null,
    enabled: !!process.env.REDIS_URL,
  },

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60_000,
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 30,
    blockDurationMs: parseInt(process.env.RATE_LIMIT_BLOCK_DURATION_MS) || 300_000,
  },

  toxicity: {
    threshold: parseFloat(process.env.TOXICITY_THRESHOLD) || 0.7,
  },

  webhook: {
    secret: process.env.WEBHOOK_SECRET || "default-secret",
    timeoutMs: parseInt(process.env.WEBHOOK_TIMEOUT_MS) || 5000,
  },

  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY || null,
  },

  dashboard: {
    password: process.env.DASHBOARD_PASSWORD || "admin123",
  },
};
