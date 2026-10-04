import mongoose from "mongoose";
import Coupon from "../Models/Coupon.js";
import CouponUsage from "../Models/CouponUsage.js";
import User from "../Models/User.model.js";
import Order from "../Models/Order.js";
const adminOnly = (req, res, next) => {
  if (req.user?.role !== "admin") {
    return res.status(403).json({
      success: false,
      message: "Admin access required",
    });
  }

  next();
};

const normalizeArray = (value) => {
  if (!value) return [];

  if (Array.isArray(value)) return value;

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
    } catch {}

    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
};

const cleanCouponPayload = (body) => {
  const data = { ...body };

  if (data.code) {
    data.code = String(data.code).trim().toUpperCase();
  }

  if (data.applicableServices !== undefined) {
    data.applicableServices = normalizeArray(data.applicableServices);
  }

  if (data.applicablePaymentMethods !== undefined) {
    data.applicablePaymentMethods = normalizeArray(
      data.applicablePaymentMethods
    );
  }

  if (data.applicableUsers !== undefined) {
    data.applicableUsers = normalizeArray(data.applicableUsers);
  }

  const numericFields = [
    "discountValue",
    "maxDiscount",
    "minOrderValue",
    "maxOrderValue",
    "usageLimit",
    "perUserLimit",
    "newUserDays",
    "inactiveDays",
    "minOrders",
    "maxOrders",
    "minLifetimeSpend",
    "maxLifetimeSpend",
    "minServiceValue",
  ];

  numericFields.forEach((field) => {
    if (
      data[field] !== undefined &&
      data[field] !== null &&
      data[field] !== ""
    ) {
      data[field] = Number(data[field]);
    } else if (data[field] === "") {
      data[field] = null;
    }
  });

  // Don't allow admin to manually alter usage count
  delete data.usedCount;

  return data;
};

// ======================================================
// GET ALL COUPONS
// ======================================================

export const getAdminCoupons = async (req, res) => {
  try {
    const {
      search = "",
      status = "all",
      page = 1,
      limit = 50,
    } = req.query;

    const p = Math.max(1, Number(page) || 1);
    const l = Math.min(100, Math.max(1, Number(limit) || 50));

    const filter = {};

    if (search.trim()) {
      const regex = new RegExp(search.trim(), "i");

      filter.$or = [
        { code: regex },
        { title: regex },
        { description: regex },
      ];
    }

    if (status === "active") {
      filter.isActive = true;
    }

    if (status === "inactive") {
      filter.isActive = false;
    }

    const [coupons, total] = await Promise.all([
      Coupon.find(filter)
        .sort({ createdAt: -1 })
        .skip((p - 1) * l)
        .limit(l)
        .lean(),

      Coupon.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      data: coupons,
      meta: {
        page: p,
        limit: l,
        total,
        pages: Math.ceil(total / l),
      },
    });
  } catch (error) {
    console.error("getAdminCoupons:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch coupons",
      error: error.message,
    });
  }
};

// ======================================================
// GET SINGLE COUPON
// ======================================================

export const getAdminCoupon = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid coupon ID",
      });
    }

    const coupon = await Coupon.findById(id)
      .populate("applicableUsers", "name email phone")
      .lean();

    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: "Coupon not found",
      });
    }

    return res.json({
      success: true,
      data: coupon,
    });
  } catch (error) {
    console.error("getAdminCoupon:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch coupon",
      error: error.message,
    });
  }
};

// ======================================================
// CREATE COUPON
// ======================================================

export const createCoupon = async (req, res) => {
  try {
    const data = cleanCouponPayload(req.body);

    if (!data.code) {
      return res.status(400).json({
        success: false,
        message: "Coupon code is required",
      });
    }

    if (!data.discountType) {
      return res.status(400).json({
        success: false,
        message: "Discount type is required",
      });
    }

    if (
      data.discountType === "percentage" &&
      Number(data.discountValue) > 100
    ) {
      return res.status(400).json({
        success: false,
        message: "Percentage discount cannot exceed 100%",
      });
    }

    const existing = await Coupon.findOne({
      code: data.code,
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        message: "Coupon code already exists",
      });
    }

    const coupon = await Coupon.create(data);

    return res.status(201).json({
      success: true,
      message: "Coupon created successfully",
      data: coupon,
    });
  } catch (error) {
    console.error("createCoupon:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create coupon",
      error: error.message,
    });
  }
};

// ======================================================
// UPDATE COUPON
// ======================================================

export const updateCoupon = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid coupon ID",
      });
    }

    const data = cleanCouponPayload(req.body);

    if (data.code) {
      const duplicate = await Coupon.findOne({
        code: data.code,
        _id: { $ne: id },
      });

      if (duplicate) {
        return res.status(409).json({
          success: false,
          message: "Coupon code already exists",
        });
      }
    }

    if (
      data.discountType === "percentage" &&
      Number(data.discountValue) > 100
    ) {
      return res.status(400).json({
        success: false,
        message: "Percentage discount cannot exceed 100%",
      });
    }

    const coupon = await Coupon.findByIdAndUpdate(
      id,
      { $set: data },
      {
        new: true,
        runValidators: true,
      }
    );

    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: "Coupon not found",
      });
    }

    return res.json({
      success: true,
      message: "Coupon updated successfully",
      data: coupon,
    });
  } catch (error) {
    console.error("updateCoupon:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update coupon",
      error: error.message,
    });
  }
};

// ======================================================
// TOGGLE COUPON
// ======================================================

export const toggleCoupon = async (req, res) => {
  try {
    const { id } = req.params;

    const coupon = await Coupon.findById(id);

    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: "Coupon not found",
      });
    }

    coupon.isActive = !coupon.isActive;

    await coupon.save();

    return res.json({
      success: true,
      message: coupon.isActive
        ? "Coupon activated"
        : "Coupon deactivated",
      data: coupon,
    });
  } catch (error) {
    console.error("toggleCoupon:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to toggle coupon",
      error: error.message,
    });
  }
};

// ======================================================
// DELETE COUPON
// ======================================================

export const deleteCoupon = async (req, res) => {
  try {
    const { id } = req.params;

    const coupon = await Coupon.findById(id);

    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: "Coupon not found",
      });
    }

    // Don't delete coupon if already used.
    // Keep history intact.
    if (coupon.usedCount > 0) {
      return res.status(400).json({
        success: false,
        message:
          "This coupon has already been used. Deactivate it instead of deleting.",
      });
    }

    await Coupon.findByIdAndDelete(id);

    return res.json({
      success: true,
      message: "Coupon deleted successfully",
    });
  } catch (error) {
    console.error("deleteCoupon:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete coupon",
      error: error.message,
    });
  }
};

// ======================================================
// COUPON USAGE
// ======================================================

export const getCouponUsage = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid coupon ID",
      });
    }

    // Get coupon usage records
    const usage = await CouponUsage.find({
      couponId: id,
    })
      .sort({ createdAt: -1 })
      .lean();

    // Collect User IDs
    const userIds = usage
      .map((item) => item.userId)
      .filter(Boolean);

    // Collect Order IDs
    const orderIds = usage
      .map((item) => item.orderId)
      .filter(Boolean);

    // ---------------------------------------------
    // GET USERS
    // ---------------------------------------------

    const users = await User.find({
      _id: { $in: userIds },
    })
      .select("_id name email phone")
      .lean();

    // ---------------------------------------------
    // GET ORDERS
    // ---------------------------------------------

    const orders = await Order.find({
      _id: { $in: orderIds },
    })
      .select("_id orderId total status createdAt")
      .lean();

    // ---------------------------------------------
    // CREATE USER MAP
    // ---------------------------------------------

    const userMap = new Map(
      users.map((user) => [
        user._id.toString(),
        user,
      ])
    );

    // ---------------------------------------------
    // CREATE ORDER MAP
    // ---------------------------------------------

    const orderMap = new Map(
      orders.map((order) => [
        order._id.toString(),
        order,
      ])
    );

    // ---------------------------------------------
    // ENRICH USAGE
    // ---------------------------------------------

    const enrichedUsage = usage.map((item) => {
      const user = item.userId
        ? userMap.get(item.userId.toString())
        : null;

      const order = item.orderId
        ? orderMap.get(item.orderId.toString())
        : null;

      return {
        _id: item._id,

        couponId: item.couponId,

        discountAmount: item.discountAmount,

        status: item.status,

        usedAt: item.usedAt,

        createdAt: item.createdAt,

        // USER DETAILS
        user: user
          ? {
              _id: user._id,
              name: user.name || "",
              email: user.email || "",
              phone: user.phone || "",
            }
          : null,

        // ORDER DETAILS
        order: order
          ? {
              _id: order._id,
              orderId: order.orderId || "",
              total: order.total || 0,
              status: order.status || "",
              createdAt: order.createdAt,
            }
          : null,
      };
    });

    return res.json({
      success: true,
      data: enrichedUsage,
    });
  } catch (error) {
    console.error("getCouponUsage:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch coupon usage",
      error: error.message,
    });
  }
};

// ======================================================
// COUPON ANALYTICS
// ======================================================

export const getCouponAnalytics = async (req, res) => {
  try {
    const [
      totalCoupons,
      activeCoupons,
      inactiveCoupons,
      usageStats,
    ] = await Promise.all([
      Coupon.countDocuments(),

      Coupon.countDocuments({
        isActive: true,
      }),

      Coupon.countDocuments({
        isActive: false,
      }),

      CouponUsage.aggregate([
        {
          $match: {
            status: "used",
          },
        },
        {
          $group: {
            _id: null,
            totalUsage: { $sum: 1 },
            totalDiscount: { $sum: "$discountAmount" },
          },
        },
      ]),
    ]);

    const usage = usageStats[0] || {
      totalUsage: 0,
      totalDiscount: 0,
    };

    return res.json({
      success: true,
      data: {
        totalCoupons,
        activeCoupons,
        inactiveCoupons,
        totalUsage: usage.totalUsage,
        totalDiscount: usage.totalDiscount,
      },
    });
  } catch (error) {
    console.error("getCouponAnalytics:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch coupon analytics",
      error: error.message,
    });
  }
};