import mongoose from "mongoose";
import Pricing from "../Models/Pricing.js";

const SERVICES = [
  "Wash & Fold",
  "Wash & Iron",
  "Dry Clean",
  "Steam Iron",
  "Commercial Laundry",
];

const CATEGORIES = [
  "Men",
  "Women",
  "Kids",
  "Household",
];

const CARE_LEVELS = ["regular", "premium"];

// ---------------------------------------------------------
// ADMIN CHECK
// ---------------------------------------------------------

function requireAdmin(req, res) {
  if (!req.user) {
    res.status(401).json({
      success: false,
      message: "Authentication required",
    });

    return false;
  }

  if (req.user.role !== "vendor") {
    res.status(403).json({
      success: false,
      message: "Admin access required",
    });

    return false;
  }

  return true;
}

// ---------------------------------------------------------
// GET ALL PRICING
// GET /api/pricing
// ---------------------------------------------------------

export async function getPricing(req, res) {
  try {
    if (!requireAdmin(req, res)) return;

    const {
      service,
      category,
      active,
      search,
    } = req.query;

    const filter = {};

    if (service) {
      if (!SERVICES.includes(service)) {
        return res.status(400).json({
          success: false,
          message: "Invalid service",
        });
      }

      filter.service = service;
    }

    if (category) {
      if (!CATEGORIES.includes(category)) {
        return res.status(400).json({
          success: false,
          message: "Invalid category",
        });
      }

      filter.category = category;
    }

    if (active !== undefined) {
      filter.active = active === "true";
    }

    if (search?.trim()) {
      filter.name = {
        $regex: search.trim(),
        $options: "i",
      };
    }

    const pricing = await Pricing.find(filter)
      .sort({
        service: 1,
        category: 1,
        sortOrder: 1,
        name: 1,
        variant: 1,
      })
      .lean();

    return res.json({
      success: true,
      count: pricing.length,
      data: pricing,
    });
  } catch (error) {
    console.error("GET pricing error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch pricing",
      error: error.message,
    });
  }
}

// ---------------------------------------------------------
// GET SINGLE PRICING
// GET /api/pricing/:id
// ---------------------------------------------------------

export async function getPricingById(req, res) {
  try {
    if (!requireAdmin(req, res)) return;

    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid pricing id",
      });
    }

    const pricing = await Pricing.findById(id).lean();

    if (!pricing) {
      return res.status(404).json({
        success: false,
        message: "Pricing not found",
      });
    }

    return res.json({
      success: true,
      data: pricing,
    });
  } catch (error) {
    console.error("GET pricing by id error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch pricing",
      error: error.message,
    });
  }
}

// ---------------------------------------------------------
// CREATE PRICING
// POST /api/pricing
// ---------------------------------------------------------

export async function createPricing(req, res) {
  try {
    if (!requireAdmin(req, res)) return;

    const {
      service,
      category,
      name,
      variant = "",
      careLevel = "regular",
      price,
      active = true,
      sortOrder = 0,
      description = "",
    } = req.body;

    // -----------------------------
    // Validation
    // -----------------------------

    if (!service || !SERVICES.includes(service)) {
      return res.status(400).json({
        success: false,
        message: "Valid service is required",
      });
    }

    if (!category || !CATEGORIES.includes(category)) {
      return res.status(400).json({
        success: false,
        message: "Valid category is required",
      });
    }

    if (!name?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Item name is required",
      });
    }

    if (
      careLevel &&
      !CARE_LEVELS.includes(careLevel)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid care level",
      });
    }

    const numericPrice = Number(price);

    if (!Number.isFinite(numericPrice) || numericPrice < 0) {
      return res.status(400).json({
        success: false,
        message: "Price must be a valid number greater than or equal to 0",
      });
    }

    const normalizedVariant = String(
      variant || ""
    ).trim();

    // -----------------------------
    // Duplicate check
    // -----------------------------

    const existing = await Pricing.findOne({
      service,
      category,
      name: name.trim(),
      variant: normalizedVariant,
      careLevel,
    }).lean();

    if (existing) {
      return res.status(409).json({
        success: false,
        message:
          "Pricing already exists for this service, category, item and variant",
        data: existing,
      });
    }

    // -----------------------------
    // Create
    // -----------------------------

    const pricing = await Pricing.create({
      service,
      category,
      name: name.trim(),
      variant: normalizedVariant,
      careLevel,
      price: numericPrice,
      active: Boolean(active),
      sortOrder: Number(sortOrder) || 0,
      description: String(description || "").trim(),
    });

    return res.status(201).json({
      success: true,
      message: "Pricing created successfully",
      data: pricing,
    });
  } catch (error) {
    console.error("CREATE pricing error:", error);

    // Mongo duplicate key protection
    if (error?.code === 11000) {
      return res.status(409).json({
        success: false,
        message:
          "Pricing already exists for this combination",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to create pricing",
      error: error.message,
    });
  }
}

// ---------------------------------------------------------
// UPDATE PRICING
// PUT /api/pricing/:id
// ---------------------------------------------------------

export async function updatePricing(req, res) {
  try {
    if (!requireAdmin(req, res)) return;

    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid pricing id",
      });
    }

    const existing = await Pricing.findById(id);

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Pricing not found",
      });
    }

    const {
      service,
      category,
      name,
      variant,
      careLevel,
      price,
      active,
      sortOrder,
      description,
    } = req.body;

    // -----------------------------
    // Validate provided values
    // -----------------------------

    if (
      service !== undefined &&
      !SERVICES.includes(service)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid service",
      });
    }

    if (
      category !== undefined &&
      !CATEGORIES.includes(category)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid category",
      });
    }

    if (
      careLevel !== undefined &&
      !CARE_LEVELS.includes(careLevel)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid care level",
      });
    }

    if (
      price !== undefined &&
      (!Number.isFinite(Number(price)) ||
        Number(price) < 0)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid price",
      });
    }

    // -----------------------------
    // Build update
    // -----------------------------

    if (service !== undefined) {
      existing.service = service;
    }

    if (category !== undefined) {
      existing.category = category;
    }

    if (name !== undefined) {
      if (!String(name).trim()) {
        return res.status(400).json({
          success: false,
          message: "Item name cannot be empty",
        });
      }

      existing.name = String(name).trim();
    }

    if (variant !== undefined) {
      existing.variant = String(
        variant || ""
      ).trim();
    }

    if (careLevel !== undefined) {
      existing.careLevel = careLevel;
    }

    if (price !== undefined) {
      existing.price = Number(price);
    }

    if (active !== undefined) {
      existing.active = Boolean(active);
    }

    if (sortOrder !== undefined) {
      existing.sortOrder =
        Number(sortOrder) || 0;
    }

    if (description !== undefined) {
      existing.description = String(
        description || ""
      ).trim();
    }

    // -----------------------------
    // Duplicate combination check
    // -----------------------------

    const duplicate = await Pricing.findOne({
      _id: { $ne: existing._id },
      service: existing.service,
      category: existing.category,
      name: existing.name,
      variant: existing.variant,
      careLevel: existing.careLevel,
    }).lean();

    if (duplicate) {
      return res.status(409).json({
        success: false,
        message:
          "Another pricing entry already exists for this combination",
      });
    }

    await existing.save();

    return res.json({
      success: true,
      message: "Pricing updated successfully",
      data: existing,
    });
  } catch (error) {
    console.error("UPDATE pricing error:", error);

    if (error?.code === 11000) {
      return res.status(409).json({
        success: false,
        message:
          "Pricing already exists for this combination",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to update pricing",
      error: error.message,
    });
  }
}

// ---------------------------------------------------------
// TOGGLE ACTIVE STATUS
// PATCH /api/pricing/:id/status
// ---------------------------------------------------------

export async function togglePricingStatus(req, res) {
  try {
    if (!requireAdmin(req, res)) return;

    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid pricing id",
      });
    }

    const pricing = await Pricing.findById(id);

    if (!pricing) {
      return res.status(404).json({
        success: false,
        message: "Pricing not found",
      });
    }

    pricing.active = !pricing.active;

    await pricing.save();

    return res.json({
      success: true,
      message: pricing.active
        ? "Pricing activated"
        : "Pricing deactivated",
      data: pricing,
    });
  } catch (error) {
    console.error(
      "TOGGLE pricing status error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to update pricing status",
      error: error.message,
    });
  }
}

// ---------------------------------------------------------
// DELETE PRICING
// DELETE /api/pricing/:id
// ---------------------------------------------------------

export async function deletePricing(req, res) {
  try {
    if (!requireAdmin(req, res)) return;

    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid pricing id",
      });
    }

    const pricing = await Pricing.findByIdAndDelete(id);

    if (!pricing) {
      return res.status(404).json({
        success: false,
        message: "Pricing not found",
      });
    }

    return res.json({
      success: true,
      message: "Pricing deleted successfully",
      data: pricing,
    });
  } catch (error) {
    console.error("DELETE pricing error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete pricing",
      error: error.message,
    });
  }
}