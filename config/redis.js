// backend/config/redis.js

import Redis from "ioredis";

let redisClient = null;
let isConnected = false;
let isConnecting = false;
let redisDisabled = false;

// Performance metrics for Redis
const metrics = {
  hits: 0,
  misses: 0,
  errors: 0,
  totalOperations: 0,
  connectedAt: null,
  disconnectedAt: null,
};

/**
 * Initialize Redis Client
 * Fail-safe: Never crashes Express if Redis is unreachable or misconfigured.
 */
export function initRedis() {
  const isEnabled = process.env.REDIS_ENABLED !== "false";
  const redisUrl = process.env.REDIS_URL;

  if (!isEnabled) {
    console.log("ℹ️ Redis is explicitly DISABLED via REDIS_ENABLED=false. Bypassing cache.");
    redisDisabled = true;
    return null;
  }

  if (!redisUrl && !process.env.REDIS_HOST) {
    console.log("ℹ️ No REDIS_URL or REDIS_HOST found in environment. Running in direct MongoDB mode.");
    redisDisabled = true;
    return null;
  }

  if (redisClient) {
    return redisClient;
  }

  try {
    const config = {
      maxRetriesPerRequest: 1, // Fail-fast so API requests never hang
      enableOfflineQueue: false, // Drop commands if disconnected instead of memory buildup
      connectTimeout: 4000,
      commandTimeout: 2000,
      lazyConnect: true,
      retryStrategy(times) {
        if (times > 8) {
          console.warn("⚠️ Redis max reconnect attempts reached. Operating in database-fallback mode.");
          return null; // Stop retrying indefinitely to prevent retry storms
        }
        // Exponential backoff with jitter
        const delay = Math.min(times * 250, 3000) + Math.floor(Math.random() * 200);
        return delay;
      },
    };

    if (process.env.REDIS_PASSWORD) {
      config.password = process.env.REDIS_PASSWORD;
    }

    // Support both URI format and host/port format
    if (redisUrl) {
      redisClient = new Redis(redisUrl, config);
    } else {
      redisClient = new Redis({
        host: process.env.REDIS_HOST || "127.0.0.1",
        port: parseInt(process.env.REDIS_PORT || "6379", 10),
        ...config,
      });
    }

    // Attach lifecycle event listeners
    redisClient.on("connect", () => {
      console.log("🔌 Redis connection established");
    });

    redisClient.on("ready", () => {
      isConnected = true;
      metrics.connectedAt = new Date();
      console.log("⚡ Redis client ready for caching");
    });

    redisClient.on("error", (err) => {
      metrics.errors++;
      isConnected = false;
      // Log sanitized error without leaking connection credentials
      console.warn(`⚠️ Redis cache warning (${err.code || err.name}): ${err.message}. Backend will use MongoDB.`);
    });

    redisClient.on("close", () => {
      isConnected = false;
      metrics.disconnectedAt = new Date();
    });

    redisClient.on("reconnecting", (delay) => {
      console.log(`🔄 Reconnecting to Redis in ${delay}ms...`);
    });

    // Initiate connection asynchronously without blocking server startup
    if (!isConnecting) {
      isConnecting = true;
      redisClient.connect().catch((err) => {
        console.warn("⚠️ Initial Redis connection failed. Backend continuing in MongoDB fallback mode:", err.message);
      }).finally(() => {
        isConnecting = false;
      });
    }

    return redisClient;
  } catch (err) {
    console.error("Failed to construct Redis client:", err.message);
    redisDisabled = true;
    return null;
  }
}

/**
 * Check if Redis is currently connected and operational
 */
export function isRedisAvailable() {
  return !redisDisabled && isConnected && redisClient !== null && redisClient.status === "ready";
}

/**
 * Get active Redis client (or null if unavailable)
 */
export function getRedisClient() {
  return redisClient;
}

/**
 * Record cache hit
 */
export function recordCacheHit() {
  metrics.hits++;
  metrics.totalOperations++;
}

/**
 * Record cache miss
 */
export function recordCacheMiss() {
  metrics.misses++;
  metrics.totalOperations++;
}

/**
 * Record cache error
 */
export function recordCacheError() {
  metrics.errors++;
}

/**
 * Get Redis health & performance metrics
 */
export async function getRedisHealth() {
  const available = isRedisAvailable();
  let memoryUsed = "N/A";
  let pingLatencyMs = null;

  if (available && redisClient) {
    try {
      const t0 = Date.now();
      await redisClient.ping();
      pingLatencyMs = Date.now() - t0;

      const info = await redisClient.info("memory");
      const match = info.match(/used_memory_human:(.*)/);
      if (match && match[1]) {
        memoryUsed = match[1].trim();
      }
    } catch {
      // Ignore info fetch error
    }
  }

  const total = metrics.hits + metrics.misses;
  const hitRate = total > 0 ? ((metrics.hits / total) * 100).toFixed(1) + "%" : "0.0%";

  return {
    status: redisDisabled
      ? "disabled"
      : isConnected
      ? "healthy"
      : isConnecting
      ? "connecting"
      : "offline",
    isAvailable: available,
    pingLatencyMs,
    memoryUsed,
    metrics: {
      hits: metrics.hits,
      misses: metrics.misses,
      hitRate,
      errors: metrics.errors,
      totalOperations: metrics.totalOperations,
      connectedAt: metrics.connectedAt,
      disconnectedAt: metrics.disconnectedAt,
    },
  };
}

/**
 * Gracefully close Redis connection on server termination
 */
export async function closeRedisConnection() {
  if (redisClient) {
    try {
      console.log("Closing Redis connection...");
      await redisClient.quit();
      console.log("Redis connection closed cleanly");
    } catch (err) {
      console.warn("Forcing Redis disconnect:", err.message);
      redisClient.disconnect();
    } finally {
      redisClient = null;
      isConnected = false;
    }
  }
}

