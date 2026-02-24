import crypto from 'crypto';
import axios from 'axios';
import config from '../../config.js';
import { getStore } from './store.js';

const WEBHOOK_QUEUE_KEY = 'webhooks:queue';
const WEBHOOK_REGISTRY_KEY = 'webhooks:registry';
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 5000, 15000];

function signPayload(payload) {
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return 'sha256=' + crypto
    .createHmac('sha256', config.webhook.secret)
    .update(body)
    .digest('hex');
}

async function registerWebhook({ url, events = ['toxic_content'], label = '' }) {
  const store = await getStore();
  const registry = JSON.parse((await store.get(WEBHOOK_REGISTRY_KEY)) || '{}');
  const id = crypto.randomUUID();
  registry[id] = { id, url, events, label, createdAt: new Date().toISOString(), deliveries: 0 };
  await store.set(WEBHOOK_REGISTRY_KEY, JSON.stringify(registry));
  return registry[id];
}

async function listWebhooks() {
  const store = await getStore();
  const registry = JSON.parse((await store.get(WEBHOOK_REGISTRY_KEY)) || '{}');
  return Object.values(registry);
}

async function deleteWebhook(id) {
  const store = await getStore();
  const registry = JSON.parse((await store.get(WEBHOOK_REGISTRY_KEY)) || '{}');
  if (!registry[id]) return false;
  delete registry[id];
  await store.set(WEBHOOK_REGISTRY_KEY, JSON.stringify(registry));
  return true;
}

async function dispatchEvent(event, payload) {
  const store = await getStore();
  const registry = JSON.parse((await store.get(WEBHOOK_REGISTRY_KEY)) || '{}');
  const webhooks = Object.values(registry).filter(wh => wh.events.includes(event) || wh.events.includes('*'));

  if (webhooks.length === 0) return [];

  const results = await Promise.allSettled(
    webhooks.map(wh => deliverWebhook(wh, event, payload, store))
  );

  return results.map((r, i) => ({
    webhookId: webhooks[i].id,
    url: webhooks[i].url,
    success: r.status === 'fulfilled' && r.value?.success,
    error: r.status === 'rejected' ? r.reason?.message : r.value?.error,
  }));
}

async function deliverWebhook(webhook, event, payload, store, attempt = 0) {
  const body = JSON.stringify({
    id: crypto.randomUUID(),
    event,
    timestamp: new Date().toISOString(),
    data: payload,
  });

  const signature = signPayload(body);

  try {
    const response = await axios.post(webhook.url, body, {
      timeout: config.webhook.timeoutMs,
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature,
        'X-Webhook-Event': event,
        'X-Webhook-Attempt': attempt + 1,
      },
      validateStatus: status => status < 500,
    });

    const registry = JSON.parse((await store.get(WEBHOOK_REGISTRY_KEY)) || '{}');
    if (registry[webhook.id]) {
      registry[webhook.id].deliveries++;
      registry[webhook.id].lastDelivery = new Date().toISOString();
      registry[webhook.id].lastStatus = response.status;
      await store.set(WEBHOOK_REGISTRY_KEY, JSON.stringify(registry));
    }

    return { success: true, status: response.status };
  } catch (err) {
    if (attempt < MAX_RETRIES - 1) {
      await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]));
      return deliverWebhook(webhook, event, payload, store, attempt + 1);
    }
    return { success: false, error: err.message };
  }
}

async function notifyToxicContent(analysisResult, originalText, source = 'api') {
  return dispatchEvent('toxic_content', {
    source,
    text: originalText.slice(0, 200),
    analysis: analysisResult,
    severity: analysisResult.toxicity.score >= 0.9 ? 'critical'
      : analysisResult.toxicity.score >= 0.7 ? 'high' : 'medium',
  });
}

module.exports = {
  registerWebhook,
  listWebhooks,
  deleteWebhook,
  dispatchEvent,
  notifyToxicContent,
  signPayload,
};