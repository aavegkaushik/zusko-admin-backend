import mongoose from "mongoose";
import Promotion from "../Models/Promotion.js";
import Pricing from "../Models/Pricing.js";
import {
  isPromotionActive,
  calculateItemPromotionalPricing,
  applyPromotionsToItems,
} from "../utils/promotionCalculator.js";

const VALID_CATEGORIES = ["Men", "Women", "Kids", "Household"];
const VALID_SERVICES = [
  "Wash & Fold",
  "Wash & Iron",
  "Dry Clean",
  "Steam Iron",
  "Commercial Laundry",
];
const VALID_SCOPES = ["all", "categories", "items"];
const VALID_DISCOUNT_TYPES = ["percentage", "flat"];

// ---------------------------------------------------------
// AUTH / ADMIN CHECK HELPER
// ---------------------------------------------------------
function requireAdmin(req, res) {
  if (!req.user) {
    res.status(401).json({
      success: false,
      message: "Authentication required",
    });
    return false;
  }

  const role = req.user?.role?.toLowerCase();
  if (!role || !["admin", "vendor", "superadmin"].includes(role)) {
    res.status(403).json({
      success: false,
      message: "Admin or Vendor access required",
    });
    return false;
  }

  return true;
}

// ---------------------------------------------------------
// PAYLOAD SANITIZER & VALIDATOR
// ---------------------------------------------------------
function validateAndCleanPayload(body, isUpdate = false) {
  const errors = [];
  const data = {};

  if (!isUpdate || body.name !== undefined) {
    if (!body.name || !String(body.name).trim()) {
      errors.push("Promotion name is required");
    } else {
      data.name = String(body.name).trim();
    }
  }

  if (body.description !== undefined) {
    data.description = String(body.description || "").trim();
  }

  if (body.badgeText !== undefined) {
    data.badgeText = String(body.badgeText || "").trim();
  }

  if (!isUpdate || body.discountType !== undefined) {
    if (!body.discountType || !VALID_DISCOUNT_TYPES.includes(body.discountType)) {
      errors.push("Discount type must be 'percentage' or 'flat'");
    } else {
      data.discountType = body.discountType;
    }
  }

  if (!isUpdate || body.discountValue !== undefined) {
    const numericVal = Number(body.discountValue);
    if (!Number.isFinite(numericVal) || numericVal <= 0) {
      errors.push("Discount value must be a number greater than 0");
    } else if (
      (data.discountType === "percentage" || body.discountType === "percentage") &&
      numericVal > 100
    ) {
      errors.push("Percentage discount value cannot exceed 100%");
    } else {
      data.discountValue = numericVal;
    }
  }

  if (body.maxDiscount !== undefined) {
    if (body.maxDiscount === null || body.maxDiscount === "") {
      data.maxDiscount = null;
    } else {
      const maxVal = Number(body.maxDiscount);
      if (!Number.isFinite(maxVal) || maxVal < 0) {
        errors.push("Max discount must be a valid non-negative number");
      } else {
        data.maxDiscount = maxVal;
      }
    }
  }

  if (body.minOrderValue !== undefined) {
    const minVal = Number(body.minOrderValue);
    if (!Number.isFinite(minVal) || minVal < 0) {
      errors.push("Min order value must be a valid non-negative number");
    } else {
      data.minOrderValue = minVal;
    }
  }

  if (!isUpdate || body.applicableTo !== undefined) {
    const scope = body.applicableTo || "all";
    if (!VALID_SCOPES.includes(scope)) {
      errors.push("applicableTo must be 'all', 'categories', or 'items'");
    } else {
      data.applicableTo = scope;
    }
  }

  if (body.applicableCategories !== undefined) {
    const cats = Array.isArray(body.applicableCategories)
      ? body.applicableCategories
      : [];
    const invalidCats = cats.filter((c) => !VALID_CATEGORIES.includes(c));
    if (invalidCats.length > 0) {
      errors.push(`Invalid categories: ${invalidCats.join(", ")}`);
    } else {
      data.applicableCategories = cats;
    }
  }

  if (body.applicableServices !== undefined) {
    const services = Array.isArray(body.applicableServices)
      ? body.applicableServices
      : [];
    const invalidServices = services.filter((s) => !VALID_SERVICES.includes(s));
    if (invalidServices.length > 0) {
      errors.push(`Invalid services: ${invalidServices.join(", ")}`);
    } else {
      data.applicableServices = services;
    }
  }

  if (body.applicableItems !== undefined) {
    const items = Array.isArray(body.applicableItems) ? body.applicableItems : [];
    const validItemIds = [];
    for (const it of items) {
      const idStr = typeof it === "object" && it !== null ? it._id || it.id : it;
      if (mongoose.Types.ObjectId.isValid(idStr)) {
        validItemIds.push(new mongoose.Types.ObjectId(idStr));
      }
    }
    data.applicableItems = validItemIds;
  }

  if (body.startDate !== undefined) {
    if (!body.startDate) {
      data.startDate = null;
    } else {
      const d = new Date(body.startDate);
      if (isNaN(d.getTime())) {
        errors.push("Invalid start date format");
      } else {
        data.startDate = d;
      }
    }
  }

  if (body.endDate !== undefined) {
    if (!body.endDate) {
      data.endDate = null;
    } else {
      const d = new Date(body.endDate);
      if (isNaN(d.getTime())) {
        errors.push("Invalid end date format");
      } else {
        data.endDate = d;
      }
    }
  }

  if (data.startDate && data.endDate && data.startDate > data.endDate) {
    errors.push("Start date cannot be after end date");
  }

  if (body.priority !== undefined) {
    const p = Number(body.priority);
    data.priority = Number.isFinite(p) ? p : 0;
  }

  if (body.allowCouponStacking !== undefined) {
    data.allowCouponStacking = Boolean(body.allowCouponStacking);
  }

  if (body.isActive !== undefined) {
    data.isActive = Boolean(body.isActive);
  }

  return { errors, data };
}

// ---------------------------------------------------------
// GET ALL PROMOTIONS (Admin)
// GET /api/promotions
// ---------------------------------------------------------
export async function getPromotions(req, res) {
  try {
    if (!requireAdmin(req, res)) return;

    const {
      search,
      status = "all",
      applicableTo,
      page,
      limit,
    } = req.query;

    const filter = {};

    if (search && String(search).trim()) {
      filter.$or = [
        { name: { $regex: String(search).trim(), $options: "i" } },
        { description: { $regex: String(search).trim(), $options: "i" } },
        { badgeText: { $regex: String(search).trim(), $options: "i" } },
      ];
    }

    if (applicableTo && VALID_SCOPES.includes(applicableTo)) {
      filter.applicableTo = applicableTo;
    }

    const now = new Date();

    if (status === "active") {
      filter.isActive = true;
      filter.$and = filter.$and || [];
      filter.$and.push(
        { $or: [{ startDate: null }, { startDate: { $lte: now } }] },
        { $or: [{ endDate: null }, { endDate: { $gte: now } }] }
      );
    } else if (status === "scheduled") {
      filter.isActive = true;
      filter.startDate = { $gt: now };
    } else if (status === "expired") {
      filter.isActive = true;
      filter.endDate = { $lt: now };
    } else if (status === "inactive") {
      filter.isActive = false;
    }

    const total = await Promotion.countDocuments(filter);

    let query = Promotion.find(filter)
      .populate("applicableItems", "name service category variant price")
      .sort({ priority: -1, createdAt: -1 });

    if (page && limit) {
      const p = Math.max(1, Number(page) || 1);
      const l = Math.min(100, Math.max(1, Number(limit) || 20));
      query = query.skip((p - 1) * l).limit(l);
    }

    const promotions = await query.lean();

    // Compute live stats for quick KPI presentation
    const [allCount, activeCount, scheduledCount, inactiveCount] =
      await Promise.all([
        Promotion.countDocuments(),
        Promotion.countDocuments({
          isActive: true,
          $and: [
            { $or: [{ startDate: null }, { startDate: { $lte: now } }] },
            { $or: [{ endDate: null }, { endDate: { $gte: now } }] },
          ],
        }),
        Promotion.countDocuments({
          isActive: true,
          startDate: { $gt: now },
        }),
        Promotion.countDocuments({
          $or: [{ isActive: false }, { endDate: { $lt: now } }],
        }),
      ]);

    return res.json({
      success: true,
      count: promotions.length,
      total,
      stats: {
        total: allCount,
        active: activeCount,
        scheduled: scheduledCount,
        inactive: inactiveCount,
      },
      data: promotions,
    });
  } catch (error) {
    console.error("GET promotions error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch promotions",
      error: error.message,
    });
  }
}

// ---------------------------------------------------------
// GET SINGLE PROMOTION (Admin)
// GET /api/promotions/:id
// ---------------------------------------------------------
export async function getPromotionById(req, res) {
  try {
    if (!requireAdmin(req, res)) return;

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid promotion id",
      });
    }

    const promotion = await Promotion.findById(id)
      .populate("applicableItems", "name service category variant careLevel price active")
      .lean();

    if (!promotion) {
      return res.status(404).json({
        success: false,
        message: "Promotion not found",
      });
    }

    return res.json({
      success: true,
      data: promotion,
    });
  } catch (error) {
    console.error("GET promotion by id error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch promotion",
      error: error.message,
    });
  }
}

// ---------------------------------------------------------
// CREATE PROMOTION (Admin)
// POST /api/promotions
// ---------------------------------------------------------
export async function createPromotion(req, res) {
  try {
    if (!requireAdmin(req, res)) return;

    const { errors, data } = validateAndCleanPayload(req.body, false);
    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: errors.join(". "),
        errors,
      });
    }

    const promotion = await Promotion.create(data);

    return res.status(201).json({
      success: true,
      message: "Promotion created successfully",
      data: promotion,
    });
  } catch (error) {
    console.error("CREATE promotion error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create promotion",
      error: error.message,
    });
  }
}

// ---------------------------------------------------------
// UPDATE PROMOTION (Admin)
// PUT /api/promotions/:id
// ---------------------------------------------------------
export async function updatePromotion(req, res) {
  try {
    if (!requireAdmin(req, res)) return;

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid promotion id",
      });
    }

    const existing = await Promotion.findById(id);
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Promotion not found",
      });
    }

    const { errors, data } = validateAndCleanPayload(req.body, true);
    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: errors.join(". "),
        errors,
      });
    }

    Object.assign(existing, data);
    await existing.save();

    const updated = await Promotion.findById(id)
      .populate("applicableItems", "name service category variant price")
      .lean();

    return res.json({
      success: true,
      message: "Promotion updated successfully",
      data: updated,
    });
  } catch (error) {
    console.error("UPDATE promotion error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update promotion",
      error: error.message,
    });
  }
}

// ---------------------------------------------------------
// TOGGLE PROMOTION STATUS (Admin)
// PATCH /api/promotions/:id/status
// ---------------------------------------------------------
export async function togglePromotionStatus(req, res) {
  try {
    if (!requireAdmin(req, res)) return;

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid promotion id",
      });
    }

    const promotion = await Promotion.findById(id);
    if (!promotion) {
      return res.status(404).json({
        success: false,
        message: "Promotion not found",
      });
    }

    promotion.isActive = !promotion.isActive;
    await promotion.save();

    return res.json({
      success: true,
      message: promotion.isActive
        ? "Promotion activated successfully"
        : "Promotion deactivated successfully",
      data: promotion,
    });
  } catch (error) {
    console.error("TOGGLE promotion status error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to toggle promotion status",
      error: error.message,
    });
  }
}

// ---------------------------------------------------------
// DELETE PROMOTION (Admin)
// DELETE /api/promotions/:id
// ---------------------------------------------------------
export async function deletePromotion(req, res) {
  try {
    if (!requireAdmin(req, res)) return;

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid promotion id",
      });
    }

    const deleted = await Promotion.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Promotion not found",
      });
    }

    return res.json({
      success: true,
      message: "Promotion deleted successfully",
      data: deleted,
    });
  } catch (error) {
    console.error("DELETE promotion error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete promotion",
      error: error.message,
    });
  }
}

// ---------------------------------------------------------
// PREVIEW PROMOTIONAL PRICING (Admin)
// POST or GET /api/promotions/preview
// ---------------------------------------------------------
export async function previewPromotions(req, res) {
  try {
    if (!requireAdmin(req, res)) return;

    // Body or query can provide draft promotion fields or a promotionId
    const {
      promotionId,
      discountType,
      discountValue,
      maxDiscount,
      applicableTo,
      applicableCategories,
      applicableServices,
      applicableItems,
      priority,
      serviceFilter,
      categoryFilter,
      search,
    } = req.method === "POST" ? req.body : req.query;

    let candidatePromotions = [];

    if (promotionId && mongoose.Types.ObjectId.isValid(promotionId)) {
      const existing = await Promotion.findById(promotionId).lean();
      if (existing) {
        candidatePromotions.push(existing);
      }
    } else if (discountType && discountValue) {
      // Draft promotion for live form preview
      candidatePromotions.push({
        _id: "draft_preview",
        name: "Preview Promotion",
        discountType,
        discountValue: Number(discountValue) || 0,
        maxDiscount: maxDiscount ? Number(maxDiscount) : null,
        applicableTo: applicableTo || "all",
        applicableCategories: Array.isArray(applicableCategories)
          ? applicableCategories
          : applicableCategories
          ? String(applicableCategories).split(",")
          : [],
        applicableServices: Array.isArray(applicableServices)
          ? applicableServices
          : applicableServices
          ? String(applicableServices).split(",")
          : [],
        applicableItems: Array.isArray(applicableItems)
          ? applicableItems
          : applicableItems
          ? String(applicableItems).split(",")
          : [],
        priority: Number(priority) || 0,
        isActive: true,
      });
    } else {
      // If no specific promotion provided, preview ALL currently active promotions!
      candidatePromotions = await Promotion.find({ isActive: true })
        .sort({ priority: -1 })
        .lean();
    }

    // Build filter for Pricing items
    const pricingFilter = { active: true };
    if (serviceFilter && VALID_SERVICES.includes(serviceFilter)) {
      pricingFilter.service = serviceFilter;
    }
    if (categoryFilter && VALID_CATEGORIES.includes(categoryFilter)) {
      pricingFilter.category = categoryFilter;
    }
    if (search && String(search).trim()) {
      pricingFilter.name = { $regex: String(search).trim(), $options: "i" };
    }

    const items = await Pricing.find(pricingFilter)
      .sort({ service: 1, category: 1, sortOrder: 1, name: 1 })
      .lean();

    const enriched = applyPromotionsToItems(items, candidatePromotions, new Date());

    let discountedCount = 0;
    let totalSavings = 0;

    enriched.forEach((item) => {
      if (item.hasActivePromotion && item.discountAmount > 0) {
        discountedCount++;
        totalSavings += item.discountAmount;
      }
    });

    return res.json({
      success: true,
      summary: {
        totalEvaluated: enriched.length,
        totalDiscounted: discountedCount,
        totalSavings: Math.round(totalSavings * 100) / 100,
        promotionsEvaluated: candidatePromotions.length,
      },
      data: enriched,
    });
  } catch (error) {
    console.error("PREVIEW promotions error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to generate pricing preview",
      error: error.message,
    });
  }
}

// ---------------------------------------------------------
// GET ACTIVE PROMOTIONS (Public / Customer Facing)
// GET /api/promotions/active
// ---------------------------------------------------------
export async function getActivePromotions(req, res) {
  try {
    const now = new Date();

    const activePromotions = await Promotion.find({
      isActive: true,
      $and: [
        { $or: [{ startDate: null }, { startDate: { $lte: now } }] },
        { $or: [{ endDate: null }, { endDate: { $gte: now } }] },
      ],
    })
      .select(
        "name description badgeText discountType discountValue maxDiscount minOrderValue applicableTo applicableCategories applicableServices applicableItems allowCouponStacking priority startDate endDate"
      )
      .sort({ priority: -1, createdAt: -1 })
      .lean();

    return res.json({
      success: true,
      count: activePromotions.length,
      data: activePromotions,
    });
  } catch (error) {
    console.error("GET active promotions error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch active promotions",
      error: error.message,
    });
  }
}

