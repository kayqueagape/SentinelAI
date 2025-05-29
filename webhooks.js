import express from "express";
import { 
  registerWebhook, 
  listWebhooks, 
  deleteWebhook, 
  dispatchEvent, 
  signPayload 
} from "../services/webhook.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const webhooks = await listWebhooks();
    res.json({ count: webhooks.length, webhooks });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/", async (req, res) => {
  const { url, events, label } = req.body;

  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "`url` is required." });
  }

  try {
    new URL(url);
  } catch {
    return res.status(400).json({ error: "Invalid URL format." });
  }

  const validEvents = ["toxic_content", "analysis_complete", "*"];
  const requestedEvents = events || ["toxic_content"];

  if (!Array.isArray(requestedEvents) || !requestedEvents.every(e => validEvents.includes(e))) {
    return res.status(400).json({ error: `Invalid events. Supported: ${validEvents.join(", ")}` });
  }

  try {
    const webhook = await registerWebhook({ url, events: requestedEvents, label });
    res.status(201).json({
      message: "Webhook registered successfully.",
      webhook,
      secret: "Check X-Webhook-Signature header on delivery for HMAC-SHA256 validation.",
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const deleted = await deleteWebhook(req.params.id);
    if (!deleted) return res.status(404).json({ error: "Webhook not found." });
    res.json({ message: "Webhook deleted." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/test", async (req, res) => {
  const { event = "toxic_content" } = req.body;
  try {
    const results = await dispatchEvent(event, {
      test: true,
      message: "This is a test webhook delivery.",
      timestamp: new Date().toISOString(),
    });
    res.json({ dispatched: results.length, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/verify", (req, res) => {
  const { payload, signature } = req.body;
  if (!payload || !signature) {
    return res.status(400).json({ error: "`payload` and `signature` are required." });
  }
  const expected = signPayload(payload);
  const valid = expected === signature;
  res.json({ valid, expected: valid ? signature : "[hidden]" });
});

module.exports = router;
