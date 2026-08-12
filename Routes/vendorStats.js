// backend/routes/vendorStats.js (ESM)

import express from "express";
import mongoose from "mongoose";
import auth from "../Middleware/auth.middleware.js";
import Order from "../Models/Order.js";

const router = express.Router();

const isValidObjectId = (id) =>
  mongoose.Types.ObjectId.isValid(id);

/**
 * GET /api/vendors/:vendorId/stats
 *
 * Requires auth.
 *
 * Vendor:
 *   - Can fetch only their own stats
 *
 * Admin:
 *   - Can fetch any vendor stats
 *
 * Returns:
 *   - totalOrders
 *   - totalEarnings
 *   - byStatus
 *   - daySeries
 *   - weekSeries
 *   - monthSeries
 */
router.get("/:vendorId/stats", auth, async (req, res) => {
  try {
    const { vendorId } = req.params;

    // =========================================
    // Validate vendor ID
    // =========================================

    if (!isValidObjectId(vendorId)) {
      return res.status(400).json({
        message: "Invalid vendorId",
      });
    }

    // =========================================
    // Authorization
    // =========================================

    if (
      req.user.role === "vendor" &&
      String(req.user.id) !== String(vendorId)
    ) {
      return res.status(403).json({
        message: "Forbidden",
      });
    }

    // =========================================
    // Convert vendorId to MongoDB ObjectId
    // IMPORTANT: use mongoose.Types.ObjectId
    // =========================================

    const vendorObjectId =
      new mongoose.Types.ObjectId(vendorId);

    const now = new Date();

    // =========================================
    // TOTALS + BY STATUS
    // =========================================

    const totalsAgg = await Order.aggregate([
      {
        $match: {
          vendorId: vendorObjectId,
        },
      },

      {
        $group: {
          _id: "$status",

          count: {
            $sum: 1,
          },

          earnings: {
            $sum: {
              $ifNull: ["$total", 0],
            },
          },
        },
      },
    ]);

    let totalOrders = 0;
    let totalEarnings = 0;

    const byStatus = {};

    totalsAgg.forEach((r) => {
      byStatus[r._id] = {
        count: r.count,
        earnings: r.earnings,
      };

      totalOrders += r.count;
      totalEarnings += r.earnings;
    });

    // =========================================
    // DAY SERIES
    // Last 24 hours
    // =========================================

    const dayFrom = new Date(
      now.getTime() - 24 * 60 * 60 * 1000
    );

    const dayAgg = await Order.aggregate([
      {
        $match: {
          vendorId: vendorObjectId,
          createdAt: {
            $gte: dayFrom,
          },
        },
      },

      {
        $group: {
          _id: {
            hour: {
              $hour: "$createdAt",
            },
          },

          count: {
            $sum: 1,
          },

          earnings: {
            $sum: {
              $ifNull: ["$total", 0],
            },
          },
        },
      },

      {
        $sort: {
          "_id.hour": 1,
        },
      },
    ]);

    const daySeries = Array.from(
      { length: 24 },
      (_, i) => {
        const found = dayAgg.find(
          (x) =>
            (x._id.hour ?? x._id) === i
        );

        return {
          label: `${i}:00`,
          count: found ? found.count : 0,
          earnings: found
            ? found.earnings
            : 0,
        };
      }
    );

    // =========================================
    // WEEK SERIES
    // Last 7 days
    // =========================================

    const weekFrom = new Date(
      now.getTime() -
        7 * 24 * 60 * 60 * 1000
    );

    const weekAgg = await Order.aggregate([
      {
        $match: {
          vendorId: vendorObjectId,
          createdAt: {
            $gte: weekFrom,
          },
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

          count: {
            $sum: 1,
          },

          earnings: {
            $sum: {
              $ifNull: ["$total", 0],
            },
          },
        },
      },

      {
        $sort: {
          _id: 1,
        },
      },
    ]);

    const weekSeries = [];

    for (let i = 6; i >= 0; i--) {
      const d = new Date(
        now.getTime() -
          i * 24 * 60 * 60 * 1000
      );

      const key = d
        .toISOString()
        .slice(0, 10);

      const found = weekAgg.find(
        (x) => x._id === key
      );

      weekSeries.push({
        label: key,
        count: found ? found.count : 0,
        earnings: found
          ? found.earnings
          : 0,
      });
    }

    // =========================================
    // MONTH SERIES
    // Last 30 days
    // =========================================

    const monthFrom = new Date(
      now.getTime() -
        30 * 24 * 60 * 60 * 1000
    );

    const monthAgg = await Order.aggregate([
      {
        $match: {
          vendorId: vendorObjectId,
          createdAt: {
            $gte: monthFrom,
          },
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

          count: {
            $sum: 1,
          },

          earnings: {
            $sum: {
              $ifNull: ["$total", 0],
            },
          },
        },
      },

      {
        $sort: {
          _id: 1,
        },
      },
    ]);

    const monthSeries = [];

    for (let i = 29; i >= 0; i--) {
      const d = new Date(
        now.getTime() -
          i * 24 * 60 * 60 * 1000
      );

      const key = d
        .toISOString()
        .slice(0, 10);

      const found = monthAgg.find(
        (x) => x._id === key
      );

      monthSeries.push({
        label: key,
        count: found ? found.count : 0,
        earnings: found
          ? found.earnings
          : 0,
      });
    }

    // =========================================
    // FINAL RESPONSE
    // =========================================

    return res.json({
      totalOrders,
      totalEarnings,
      byStatus,
      daySeries,
      weekSeries,
      monthSeries,
    });
  } catch (err) {
    console.error(
      "/api/vendors/:vendorId/stats error:",
      err
    );

    return res.status(500).json({
      message: "Server error",
      error: err.message,
    });
  }
});

export default router;