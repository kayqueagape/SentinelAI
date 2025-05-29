import express from "express";
import { v4 as uuidv4 } from "uuid";
import { analyzeText } from "../services/analyzer.js";
import { notifyToxicContent } from "../services/webhook.js";
import { addEntry } from "../services/eventLog.js";

const router = express.Router();

router.post("/", async (req, res) => {
  const { text, source = "api", metadata = {} } = req.body;

  if (!text || typeof text !== "string") {
    return res.status(400).json({
      error: "Invalid input",
      message: "`text` field is required and must be a string.",
    });
  }

  if (text.length > 5000) {
    return res.status(400).json({
      error: "Text too long",
      message: "Maximum text length is 5000 characters.",
    });
  }

  if (text.trim().length < 2) {
    return res.status(400).json({
      error: "Text too short",
      message: "Text must be at least 2 characters.",
    });
  }

  const id = uuidv4();
  const timestamp = new Date().toISOString();

  try {
    const analysis = await analyzeText(text);

    const entry = {
      id,
      timestamp,
      source,
      metadata,
      text: text.slice(0, 500),
      analysis,
    };

    addEntry(entry);

    if (analysis.toxicity.isToxic) {
      notifyToxicContent(analysis, text, source).catch(err =>
        console.error("Webhook dispatch failed:", err.message)
      );
    }

    if (req.emitAnalysis) {
      req.emitAnalysis(entry);
    }

    return res.status(200).json({ id, timestamp, analysis, _meta: { source, metadata } });
  } catch (err) {
    console.error("Analysis error:", err);
    return res.status(500).json({ error: "Analysis failed", message: err.message });
  }
});

router.post("/batch", async (req, res) => {
  const { texts, source = "api" } = req.body;

  if (!Array.isArray(texts) || texts.length === 0) {
    return res.status(400).json({ error: "`texts` must be a non-empty array." });
  }

  if (texts.length > 20) {
    return res.status(400).json({ error: "Batch limit is 20 texts per request." });
  }

  const timestamp = new Date().toISOString();

  try {
    const results = await Promise.allSettled(
      texts.map(text => analyzeText(String(text).slice(0, 5000)))
    );

    const items = results.map((r, i) => {
      if (r.status === "fulfilled") {
        const entry = {
          id: uuidv4(),
          timestamp,
          source,
          text: texts[i].slice(0, 500),
          analysis: r.value,
        };
        addEntry(entry);
        if (r.value.toxicity.isToxic && req.emitAnalysis) req.emitAnalysis(entry);
        return { index: i, success: true, analysis: r.value };
      }
      return { index: i, success: false, error: r.reason?.message };
    });

    return res.status(200).json({ timestamp, count: texts.length, items });
  } catch (err) {
    return res.status(500).json({ error: "Batch analysis failed", message: err.message });
  }
});

module.exports = router;
