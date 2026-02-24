import config from '../../config.js';
import { getStore } from './store.js';

const WINDOW_MS = config.rateLimit.windowMs;
const MAX_REQUESTS = config.rateLimit.maxRequests;
const BLOCK_DURATION_MS = config.rateLimit.blockDurationMs;

async function checkRateLimit(identifier) {
  const store = await getStore();
  const blockKey = `rl:block:${identifier}`;
  const countKey = `rl:count:${identifier}`;

  const blocked = await store.get(blockKey);
  if (blocked) {
    const ttlSecs = await store.ttl(blockKey);
    return {
      allowed: false,
      blocked: true,
      retryAfterMs: ttlSecs > 0 ? ttlSecs * 1000 : BLOCK_DURATION_MS,
      remaining: 0,
      resetMs: Date.now() + (ttlSecs > 0 ? ttlSecs * 1000 : BLOCK_DURATION_MS),
    };
  }

  const count = await store.incr(countKey);

  if (count === 1) {
    // First request in window — set expiry
    await store.expire(countKey, Math.ceil(WINDOW_MS / 1000));
  }

  const remaining = Math.max(0, MAX_REQUESTS - count);

  if (count > MAX_REQUESTS) {
    await store.set(blockKey, '1', BLOCK_DURATION_MS);
    await store.del(countKey);
    return {
      allowed: false,
      blocked: true,
      retryAfterMs: BLOCK_DURATION_MS,
      remaining: 0,
      resetMs: Date.now() + BLOCK_DURATION_MS,
    };
  }

  return {
    allowed: true,
    blocked: false,
    count,
    remaining,
    resetMs: Date.now() + WINDOW_MS,
    limitPerWindow: MAX_REQUESTS,
  };
}

async function rateLimiterMiddleware(req, res, next) {
  const identifier = req.ip || req.connection.remoteAddress || 'unknown';
  try {
    const result = await checkRateLimit(identifier);
    res.set('X-RateLimit-Limit', MAX_REQUESTS);
    res.set('X-RateLimit-Remaining', result.remaining ?? 0);
    res.set('X-RateLimit-Reset', new Date(result.resetMs).toISOString());

    if (!result.allowed) {
      res.set('Retry-After', Math.ceil(result.retryAfterMs / 1000));
      return res.status(429).json({
        error: 'Too Many Requests',
        message: `Rate limit exceeded. Try again in ${Math.ceil(result.retryAfterMs / 1000)}s.`,
        retryAfterMs: result.retryAfterMs,
      });
    }
    next();
  } catch (err) {
    console.error('Rate limiter error:', err);
    next();
  }
}

module.exports = { checkRateLimit, rateLimiterMiddleware };