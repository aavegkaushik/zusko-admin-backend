// backend/routes/vendorStats.js (ESM)

import express from "express";
import mongoose from "mongoose";
import auth from "../Middleware/auth.middleware.js";
import Order from "../Models/Order.js";
import Vendor from "../Models/Vendor.js";
import {
  getOrSetCache,
  CacheKeys,
  CACHE_TTL,
} from "../services/cache.service.js";

const router = express.Router();

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

/**
 * =========================================================
 * GET /api/vendors/dashboard/bootstrap
 * CONSOLIDATED DASHBOARD BOOTSTRAP API
 *
 * Eliminates 3-4 separate HTTP requests when opening the dashboard.
 * Returns:
 *   - Vendor profile summary
 *   - Key statistics (totalOrders, revenue, byStatus counts)
 *   - Recent orders (last 10)
 *   - Pending order count
 *   - Operational status
 *
 * Cached via Redis (TTL: 60s) with automated invalidation.
 * =========================================================
 */
router.get("/dashboard/bootstrap", auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const isVendor = req.user.role === "vendor";

    if (!isValidObjectId(userId)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }

    const cacheKey = CacheKeys.vendorBootstrap(userId);

    const bootstrapData = await getOrSetCache(
      cacheKey,
      CACHE_TTL.DASHBOARD_BOOTSTRAP,
      async () => {
        const orderMatch = req.query.vendorId && isValidObjectId(req.query.vendorId)
          ? { vendorId: new mongoose.Types.ObjectId(req.query.vendorId) }
          : {};

        // Run independent queries in parallel
        const [vendorProfile, statusAggregation, recentOrders, pendingCount] =
          await Promise.all([
            Vendor.findById(userId)
              .select("name email avatar storeName storeAddress storePhone notifications role")
              .lean(),

            Order.aggregate([
              { $match: orderMatch },
              {
                $group: {
                  _id: "$status",
                  count: { $sum: 1 },
                  revenue: { $sum: { $ifNull: ["$total", 0] } },
                },
              },
            ]),

            Order.find(orderMatch)
              .select("orderId customerName customerPhone total status createdAt items")
              .sort({ createdAt: -1 })
              .limit(10)
              .lean(),

            Order.countDocuments({ ...orderMatch, status: "pending" }),
          ]);

        // Process status aggregation
        let totalOrders = 0;
        let totalRevenue = 0;
        const byStatus = {};

        statusAggregation.forEach((s) => {
          const statusKey = s._id || "unknown";
          byStatus[statusKey] = s.count;
          totalOrders += s.count;
          totalRevenue += s.revenue;
        });

        // Format recent orders with lightweight projection
        const formattedRecentOrders = recentOrders.map((o) => ({
          _id: o._id,
          orderId: o.orderId,
          customerName: o.customerName || "Customer",
          customerPhone: o.customerPhone || "",
          total: o.total || 0,
          status: o.status,
          createdAt: o.createdAt,
          itemCount: Array.isArray(o.items) ? o.items.length : 0,
        }));

        return {
          vendor: vendorProfile || {
            _id: userId,
            name: req.user.email?.split("@")[0] || "Vendor",
            email: req.user.email,
            role: req.user.role,
          },
          stats: {
            totalOrders,
            totalRevenue,
            byStatus,
            pendingOrders: pendingCount,
            activeOrders:
              (byStatus["accepted"] || 0) +
              (byStatus["in-progress"] || 0) +
              (byStatus["picked-up"] || 0) +
              (byStatus["ready-for-delivery"] || 0) +
              (byStatus["out-for-delivery"] || 0),
            completedOrders: byStatus["completed"] || 0,
            cancelledOrders: byStatus["cancelled"] || 0,
          },
          recentOrders: formattedRecentOrders,
          pendingOrderCount: pendingCount,
          operationalStatus: {
            isAcceptingOrders: true,
            serverTime: new Date().toISOString(),
          },
        };
      }
    );

    return res.json({
      ok: true,
      data: bootstrapData,
    });
  } catch (err) {
    console.error("Dashboard Bootstrap error:", err);
    return res.status(500).json({
      message: "Server error loading dashboard",
      error: err.message,
    });
  }
});

/**
 * =========================================================
 * GET /api/vendors/:vendorId/stats
 *
 * Detailed time-series vendor stats.
 * Cached in Redis with 60s TTL.
 * =========================================================
 */
router.get("/:vendorId/stats", auth, async (req, res) => {
  try {
    const { vendorId } = req.params;

    if (!isValidObjectId(vendorId)) {
      return res.status(400).json({
        message: "Invalid vendorId",
      });
    }

    if (
      req.user.role === "vendor" &&
      String(req.user.id) !== String(vendorId)
    ) {
      return res.status(403).json({
        message: "Forbidden",
      });
    }

    const cacheKey = CacheKeys.vendorStats(vendorId);

    const statsData = await getOrSetCache(
      cacheKey,
      CACHE_TTL.VENDOR_STATS,
      async () => {
        const vendorObjectId = new mongoose.Types.ObjectId(vendorId);
        const now = new Date();

        // Check if orders exist specifically for this vendorId, else match store-wide
        const vendorOrderCount = await Order.countDocuments({ vendorId: vendorObjectId });
        const matchFilter = vendorOrderCount > 0 ? { vendorId: vendorObjectId } : {};

        // 1. TOTALS + BY STATUS
        const totalsAgg = await Order.aggregate([
          { $match: matchFilter },
          {
            $group: {
              _id: "$status",
              count: { $sum: 1 },
              earnings: { $sum: { $ifNull: ["$total", 0] } },
            },
          },
        ]);

        let totalOrders = 0;
        let totalEarnings = 0;
        const byStatus = {};

        totalsAgg.forEach((item) => {
          byStatus[item._id] = item.count;
          totalOrders += item.count;
          totalEarnings += item.earnings;
        });

        // 2. DAY SERIES (24 hours)
        const dayStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const dayAgg = await Order.aggregate([
          {
            $match: {
              ...matchFilter,
              createdAt: { $gte: dayStart },
            },
          },
          {
            $group: {
              _id: { $hour: "$createdAt" },
              count: { $sum: 1 },
              earnings: { $sum: { $ifNull: ["$total", 0] } },
            },
          },
          { $sort: { _id: 1 } },
        ]);

        const daySeries = [];
        for (let i = 0; i < 24; i++) {
          const found = dayAgg.find((x) => x._id === i);
          daySeries.push({
            label: `${i}:00`,
            count: found ? found.count : 0,
            earnings: found ? found.earnings : 0,
          });
        }

        // 3. WEEK SERIES (7 days)
        const weekStart = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
        const weekAgg = await Order.aggregate([
          {
            $match: {
              ...matchFilter,
              createdAt: { $gte: weekStart },
            },
          },
          {
            $group: {
              _id: {
                $dateToString: {
                  format: "%Y-%m-%d",
                  date: "$createdAt",
                },
              },
              count: { $sum: 1 },
              earnings: { $sum: { $ifNull: ["$total", 0] } },
            },
          },
          { $sort: { _id: 1 } },
        ]);

        const weekSeries = [];
        for (let i = 6; i >= 0; i--) {
          const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
          const key = d.toISOString().slice(0, 10);
          const found = weekAgg.find((x) => x._id === key);
          weekSeries.push({
            label: key,
            count: found ? found.count : 0,
            earnings: found ? found.earnings : 0,
          });
        }

        // 4. MONTH SERIES (30 days)
        const monthStart = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000);
        const monthAgg = await Order.aggregate([
          {
            $match: {
              ...matchFilter,
              createdAt: { $gte: monthStart },
            },
          },
          {
            $group: {
              _id: {
                $dateToString: {
                  format: "%Y-%m-%d",
                  date: "$createdAt",
                },
              },
              count: { $sum: 1 },
              earnings: { $sum: { $ifNull: ["$total", 0] } },
            },
          },
          { $sort: { _id: 1 } },
        ]);

        const monthSeries = [];
        for (let i = 29; i >= 0; i--) {
          const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
          const key = d.toISOString().slice(0, 10);
          const found = monthAgg.find((x) => x._id === key);
          monthSeries.push({
            label: key,
            count: found ? found.count : 0,
            earnings: found ? found.earnings : 0,
          });
        }

        return {
          totalOrders,
          totalEarnings,
          byStatus,
          daySeries,
          weekSeries,
          monthSeries,
        };
      }
    );

    return res.json(statsData);
  } catch (err) {
    console.error("/api/vendors/:vendorId/stats error:", err);
    return res.status(500).json({
      message: "Server error",
      error: err.message,
    });
  }
});

export default router;
