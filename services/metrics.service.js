// backend/services/metrics.service.js

import mongoose from "mongoose";
import { getRedisHealth } from "../config/redis.js";

const serverStartTime = Date.now();

const metrics = {
  totalRequests: 0,
  requestsByMethod: {},
  requestsByEndpoint: {},
  statusCodes: {
    "2xx": 0,
    "3xx": 0,
    "4xx": 0,
    "5xx": 0,
  },
  // Ring buffer of last 500 request durations (in ms)
  latencies: [],
  maxLatenciesSize: 500,
  // Recent slow requests (> 500ms)
  slowRequests: [],
  maxSlowRequestsSize: 25,
};

/**
 * Express middleware to track API latency, request counts, and status codes
 */
export function metricsMiddleware(req, res, next) {
  // Ignore static assets and health check
  if (
    req.path.startsWith("/uploads") ||
    req.path === "/healthz" ||
    req.path.includes("favicon")
  ) {
    return next();
  }

  const startTime = process.hrtime();
  metrics.totalRequests++;

  const method = req.method;
  metrics.requestsByMethod[method] = (metrics.requestsByMethod[method] || 0) + 1;

  // Group paths (normalize dynamic IDs to :id)
  const normalizedPath = req.path
    .replace(/[0-9a-fA-F]{24}/g, ":id")
    .replace(/\/order-[0-9]+/g, "/:orderCode");

  metrics.requestsByEndpoint[normalizedPath] =
    (metrics.requestsByEndpoint[normalizedPath] || 0) + 1;

  res.on("finish", () => {
    const diff = process.hrtime(startTime);
    const durationMs = Math.round((diff[0] * 1e3 + diff[1] * 1e-6) * 100) / 100;

    // Record latency in ring buffer
    if (metrics.latencies.length >= metrics.maxLatenciesSize) {
      metrics.latencies.shift();
    }
    metrics.latencies.push(durationMs);

    // Record status category
    const codeGroup = `${Math.floor(res.statusCode / 100)}xx`;
    if (metrics.statusCodes[codeGroup] !== undefined) {
      metrics.statusCodes[codeGroup]++;
    }

    // Record slow requests (> 500ms)
    if (durationMs > 500) {
      if (metrics.slowRequests.length >= metrics.maxSlowRequestsSize) {
        metrics.slowRequests.shift();
      }
      metrics.slowRequests.push({
        method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        durationMs,
        timestamp: new Date().toISOString(),
      });
    }
  });

  next();
}

/**
 * Calculate statistical percentiles (p50, p95, p99, avg)
 */
function calculateLatencyStats() {
  if (metrics.latencies.length === 0) {
    return { sampleSize: 0, avgMs: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0, minMs: 0, maxMs: 0 };
  }

  const sorted = [...metrics.latencies].sort((a, b) => a - b);
  const count = sorted.length;
  const sum = sorted.reduce((acc, val) => acc + val, 0);

  const getPercentile = (p) => {
    const idx = Math.min(Math.floor((p / 100) * count), count - 1);
    return sorted[idx];
  };

  return {
    sampleSize: count,
    avgMs: Math.round((sum / count) * 10) / 10,
    minMs: sorted[0],
    p50Ms: getPercentile(50),
    p95Ms: getPercentile(95),
    p99Ms: getPercentile(99),
    maxMs: sorted[count - 1],
  };
}

/**
 * Generate full performance report
 */
export async function getPerformanceReport() {
  const uptimeSeconds = Math.floor((Date.now() - serverStartTime) / 1000);
  const memory = process.memoryUsage();
  const redisHealth = await getRedisHealth();

  // MongoDB connection state
  const mongoStates = ["disconnected", "connected", "connecting", "disconnecting"];
  const mongoStatus = mongoStates[mongoose.connection.readyState] || "unknown";

  // Top endpoints by frequency
  const topEndpoints = Object.entries(metrics.requestsByEndpoint)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([path, count]) => ({ path, count }));

  return {
    timestamp: new Date().toISOString(),
    uptime: {
      seconds: uptimeSeconds,
      formatted: `${Math.floor(uptimeSeconds / 3600)}h ${Math.floor((uptimeSeconds % 3600) / 60)}m ${uptimeSeconds % 60}s`,
    },
    system: {
      nodeVersion: process.version,
      platform: process.platform,
      memory: {
        rss: `${Math.round(memory.rss / 1024 / 1024)} MB`,
        heapUsed: `${Math.round(memory.heapUsed / 1024 / 1024)} MB`,
        heapTotal: `${Math.round(memory.heapTotal / 1024 / 1024)} MB`,
        external: `${Math.round(memory.external / 1024 / 1024)} MB`,
      },
      cpuUsage: process.cpuUsage(),
    },
    redis: redisHealth,
    mongodb: {
      status: mongoStatus,
      host: mongoose.connection.host || "Atlas Cluster",
      dbName: mongoose.connection.name,
      modelsLoaded: Object.keys(mongoose.models).length,
    },
    requests: {
      total: metrics.totalRequests,
      statusCodes: metrics.statusCodes,
      byMethod: metrics.requestsByMethod,
      topEndpoints,
    },
    latency: calculateLatencyStats(),
    slowRequests: metrics.slowRequests,
  };
}
