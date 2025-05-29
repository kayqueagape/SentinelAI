import "dotenv/config";
import http from "http";
import express from "express";
import { Server } from "socket.io";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import path from "path";

import config from "../config.js";
import { rateLimiterMiddleware } from "./services/rateLimiter.js";
import { getStore } from "./services/store.js";
import { getStats, getRecentEntries } from "./services/eventLog.js";

import analyzeRouter from "./routes/analyze.js";
import webhooksRouter from "./routes/webhooks.js";
import statsRouter from "./routes/stats.js";

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  pingInterval: 10000,
  pingTimeout: 5000,
});

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(morgan(config.nodeEnv === "development" ? "dev" : "combined"));
app.use(express.static(path.join(__dirname, "../public")));

app.use((req, _res, next) => {
  req.emitAnalysis = (entry) => {
    io.emit("new_analysis", entry);
    io.emit("stats_update", getStats());
  };
  next();
});

app.use("/api/analyze", rateLimiterMiddleware, analyzeRouter);
app.use("/api/webhooks", webhooksRouter);
app.use("/api", statsRouter);

app.use((req, res) => {
  if (req.path.startsWith("/api")) {
    return res.status(404).json({ error: "Not Found", path: req.path });
  }
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

app.use((err, req, res, _next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal Server Error", message: err.message });
});

io.on("connection", (socket) => {
  console.log(`Dashboard connected: ${socket.id}`);
  socket.emit("stats_update", getStats());
  socket.emit("recent_entries", getRecentEntries(20));

  socket.on("disconnect", () => {
    console.log(`Dashboard disconnected: ${socket.id}`);
  });

  socket.on("request_stats", () => {
    socket.emit("stats_update", getStats());
    socket.emit("recent_entries", getRecentEntries(20));
  });
});

setInterval(() => {
  if (io.engine.clientsCount > 0) {
    io.emit("stats_update", getStats());
  }
}, 5000);

async function start() {
  await getStore();
  server.listen(config.port, () => {
    console.log(`Server:    http://localhost:${config.port}`);
    console.log(`Dashboard: http://localhost:${config.port}/`);
    console.log(`API:       http://localhost:${config.port}/api/analyze`);
    console.log(`Health:    http://localhost:${config.port}/api/health`);
  });
}

start().catch(err => {
  console.error("Failed to start server:", err);
  process.exit(1);
});

module.exports = { app, server, io };
