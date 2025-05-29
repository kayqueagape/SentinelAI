import config from "../../config.js";

class MemoryStore {
  constructor() {
    this.data = new Map();
    this.ttls = new Map();
    setInterval(() => this._cleanup(), 30_000);
  }

  async get(key) {
    if (this.ttls.has(key) && Date.now() > this.ttls.get(key)) {
      this.data.delete(key);
      this.ttls.delete(key);
      return null;
    }
    return this.data.get(key) ?? null;
  }

  async set(key, value, expiryMs = null) {
    this.data.set(key, value);
    if (expiryMs) this.ttls.set(key, Date.now() + expiryMs);
    return "OK";
  }

  async incr(key) {
    const current = parseInt(await this.get(key)) || 0;
    const next = current + 1;
    const ttl = this.ttls.get(key);
    await this.set(key, String(next), ttl ? ttl - Date.now() : null);
    return next;
  }

  async expire(key, seconds) {
    this.ttls.set(key, Date.now() + seconds * 1000);
    return 1;
  }

  async ttl(key) {
    if (!this.ttls.has(key)) return -1;
    const remaining = Math.ceil((this.ttls.get(key) - Date.now()) / 1000);
    return remaining > 0 ? remaining : -2;
  }

  async del(key) {
    this.data.delete(key);
    this.ttls.delete(key);
    return 1;
  }

  async lpush(key, ...values) {
    const list = JSON.parse((await this.get(key)) || "[]");
    list.unshift(...values.map(String));
    await this.set(key, JSON.stringify(list));
    return list.length;
  }

  async lrange(key, start, stop) {
    const list = JSON.parse((await this.get(key)) || "[]");
    const end = stop === -1 ? list.length : stop + 1;
    return list.slice(start, end);
  }

  async ltrim(key, start, stop) {
    const list = JSON.parse((await this.get(key)) || "[]");
    const trimmed = list.slice(start, stop + 1);
    await this.set(key, JSON.stringify(trimmed));
    return "OK";
  }

  _cleanup() {
    const now = Date.now();
    for (const [key, expiry] of this.ttls.entries()) {
      if (now > expiry) {
        this.data.delete(key);
        this.ttls.delete(key);
      }
    }
  }

  quit() {}
}

let client = null;
let isRedis = false;

async function getStore() {
  if (client) return client;

  if (config.redis.enabled) {
    try {
      const Redis = require("ioredis");
      const redis = new Redis(config.redis.url, {
        connectTimeout: 3000,
        maxRetriesPerRequest: 1,
        lazyConnect: true,
      });
      await redis.connect();
      await redis.ping();
      console.log("Redis connected:", config.redis.url);
      client = redis;
      isRedis = true;
    } catch (err) {
      console.warn("Redis unavailable, using in-memory store:", err.message);
      client = new MemoryStore();
    }
  } else {
    console.log("Redis not configured, using in-memory store");
    client = new MemoryStore();
  }

  return client;
}

function getIsRedis() {
  return isRedis;
}

module.exports = { getStore, getIsRedis };
