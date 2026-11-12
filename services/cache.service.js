// backend/services/cache.service.js

import {
  getRedisClient,
  isRedisAvailable,
  recordCacheHit,
  recordCacheMiss,
  recordCacheError,
} from "../config/redis.js";

/**
 * Standard Configurable Time-To-Live (TTL) in seconds
 */
export const CACHE_TTL = {
  VENDOR_PROFILE: 900,     // 15 minutes
  DASHBOARD_BOOTSTRAP: 60, // 60 seconds
  ORDERS_LIST: 30,         // 30 seconds
  ORDER_SINGLE: 60,        // 60 seconds
  ANALYTICS: 180,          // 3 minutes
  VENDOR_STATS: 60,        // 60 seconds
  CONFIG: 1800,            // 30 minutes
};

/**
 * Helper to build standard isolated cache keys
 */
export const CacheKeys = {
  vendorBootstrap: (vendorId) => `vendor:${vendorId}:dashboard:bootstrap`,
  vendorStats: (vendorId) => `vendor:${vendorId}:stats`,
  vendorAnalytics: (vendorId, rangeKey = "overview") => `vendor:${vendorId}:analytics:${rangeKey}`,
  vendorOrders: (vendorId, filterHash) => `vendor:${vendorId}:orders:${filterHash}`,
  adminOrders: (filterHash) => `admin:orders:${filterHash}`,
  singleOrder: (orderId) => `order:${orderId}`,
  vendorProfile: (vendorId) => `vendor:${vendorId}:profile`,
  pricingConfig: () => `config:pricing:all`,
  deliveryPartners: () => `config:delivery-partners:all`,
};

/**
 * Retrieve an item from cache
 * @param {string} key
 * @returns {Promise<any|null>}
 */
export async function getCache(key) {
  if (!isRedisAvailable()) {
    recordCacheMiss();
    return null;
  }

  try {
    const redis = getRedisClient();
    const data = await redis.get(key);

    if (data !== null) {
      recordCacheHit();
      try {
        return JSON.parse(data);
      } catch (parseErr) {
        console.warn(`Cache parse error for key ${key}:`, parseErr.message);
        return null;
      }
    }

    recordCacheMiss();
    return null;
  } catch (err) {
    recordCacheError();
    console.warn(`Redis getCache error for [${key}]:`, err.message);
    return null; // Gracefully fallback to database
  }
}

/**
 * Set an item in cache with a TTL
 * @param {string} key
 * @param {any} value
 * @param {number} ttlSeconds
 * @returns {Promise<boolean>}
 */
export async function setCache(key, value, ttlSeconds = 60) {
  if (!isRedisAvailable() || value === undefined || value === null) {
    return false;
  }

  try {
    const redis = getRedisClient();
    const serialized = JSON.stringify(value);
    await redis.set(key, serialized, "EX", ttlSeconds);
    return true;
  } catch (err) {
    recordCacheError();
    console.warn(`Redis setCache error for [${key}]:`, err.message);
    return false;
  }
}

/**
 * Delete a specific key from cache
 * @param {string} key
 * @returns {Promise<boolean>}
 */
export async function deleteCache(key) {
  if (!isRedisAvailable()) return false;

  try {
    const redis = getRedisClient();
    await redis.del(key);
    return true;
  } catch (err) {
    recordCacheError();
    console.warn(`Redis deleteCache error for [${key}]:`, err.message);
    return false;
  }
}

/**
 * Delete keys matching a pattern using SCAN (NEVER KEYS in production)
 * Uses ioredis scanStream to stream keys non-blockingly.
 * @param {string} pattern
 * @returns {Promise<number>} Number of keys deleted
 */
export async function deleteCacheByPattern(pattern) {
  if (!isRedisAvailable()) return 0;

  try {
    const redis = getRedisClient();
    let deletedCount = 0;

    return new Promise((resolve) => {
      const stream = redis.scanStream({
        match: pattern,
        count: 100,
      });

      stream.on("data", async (keys = []) => {
        if (keys.length > 0) {
          stream.pause();
          try {
            const pipeline = redis.pipeline();
            keys.forEach((k) => pipeline.del(k));
            await pipeline.exec();
            deletedCount += keys.length;
          } catch (delErr) {
            console.warn(`Error deleting scanned keys for pattern ${pattern}:`, delErr.message);
          } finally {
            stream.resume();
          }
        }
      });

      stream.on("end", () => {
        resolve(deletedCount);
      });

      stream.on("error", (err) => {
        console.warn(`Stream error scanning pattern ${pattern}:`, err.message);
        resolve(deletedCount);
      });
    });
  } catch (err) {
    recordCacheError();
    console.warn(`Redis deleteCacheByPattern error for [${pattern}]:`, err.message);
    return 0;
  }
}

/**
 * Cache-Aside Wrapper:
 * Fetches from cache, or executes fallback and populates cache.
 * @param {string} key
 * @param {number} ttlSeconds
 * @param {Function} fetcherFn
 * @returns {Promise<any>}
 */
export async function getOrSetCache(key, ttlSeconds, fetcherFn) {
  // 1. Try cache first
  const cached = await getCache(key);
  if (cached !== null) {
    return cached;
  }

  // 2. Cache miss -> execute database fetcher
  const freshData = await fetcherFn();

  // 3. Populate cache asynchronously in background (don't delay response)
  if (freshData !== null && freshData !== undefined) {
    setCache(key, freshData, ttlSeconds).catch(() => {});
  }

  return freshData;
}

// =========================================================
// DOMAIN-SPECIFIC INVALIDATION HELPERS
// =========================================================

/**
 * Invalidate all cache entries associated with a vendor
 * @param {string} vendorId
 */
export async function invalidateVendorCache(vendorId) {
  if (!vendorId) return;
  const vid = String(vendorId);
  await Promise.allSettled([
    deleteCacheByPattern(`vendor:${vid}:*`),
    deleteCache(CacheKeys.vendorProfile(vid)),
    deleteCache(CacheKeys.vendorStats(vid)),
    deleteCache(CacheKeys.vendorBootstrap(vid)),
  ]);
}

/**
 * Invalidate cache for a specific order and its associated vendor + admin views
 * @param {string} orderId
 * @param {string} [vendorId]
 */
export async function invalidateOrderCache(orderId, vendorId) {
  const tasks = [];

  if (orderId) {
    tasks.push(deleteCache(CacheKeys.singleOrder(String(orderId))));
  }

  // Invalidate admin-wide and global order listings & stats
  tasks.push(deleteCacheByPattern("orders:*"));
  tasks.push(deleteCacheByPattern("admin:orders:*"));
  tasks.push(deleteCacheByPattern("admin:dashboard:*"));

  // Invalidate vendor-specific order listings, dashboard bootstrap, stats and analytics
  if (vendorId) {
    const vid = String(vendorId);
    tasks.push(deleteCache(CacheKeys.vendorBootstrap(vid)));
    tasks.push(deleteCache(CacheKeys.vendorStats(vid)));
    tasks.push(deleteCacheByPattern(`vendor:${vid}:orders:*`));
    tasks.push(deleteCacheByPattern(`vendor:${vid}:analytics:*`));
  } else {
    // If vendorId is unknown or central, purge all vendor dashboard summaries
    tasks.push(deleteCacheByPattern("vendor:*:dashboard:*"));
    tasks.push(deleteCacheByPattern("vendor:*:orders:*"));
  }

  await Promise.allSettled(tasks);
}

/**
 * Invalidate analytics cache for a specific vendor or all vendors
 * @param {string} [vendorId]
 */
export async function invalidateAnalyticsCache(vendorId) {
  if (vendorId) {
    await deleteCacheByPattern(`vendor:${String(vendorId)}:analytics:*`);
  } else {
    await deleteCacheByPattern("vendor:*:analytics:*");
  }
}

/**
 * Invalidate all order listing caches across the system
 */
export async function invalidateAllOrderCaches() {
  await Promise.allSettled([
    deleteCacheByPattern("orders:*"),
    deleteCacheByPattern("vendor:*:orders:*"),
    deleteCacheByPattern("vendor:*:dashboard:*"),
    deleteCacheByPattern("vendor:*:stats"),
    deleteCacheByPattern("admin:orders:*"),
    deleteCacheByPattern("admin:dashboard:*"),
  ]);
}

