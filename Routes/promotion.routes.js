import express from "express";
import auth from "../Middleware/auth.middleware.js";
import {
  getPromotions,
  getPromotionById,
  createPromotion,
  updatePromotion,
  togglePromotionStatus,
  deletePromotion,
  previewPromotions,
  getActivePromotions,
} from "../controllers/promotion.controller.js";

const router = express.Router();

const adminOnly = (req, res, next) => {
  const role = req.user?.role?.toLowerCase();
  if (!role || !["admin", "vendor", "superadmin"].includes(role)) {
    return res.status(403).json({
      success: false,
      message: "Admin or Vendor access required",
    });
  }
  next();
};

// ============================================================
// PUBLIC PROMOTION ROUTES (Customer Backend / App without Admin Credentials)
// ============================================================
router.get("/active", getActivePromotions);

// ============================================================
// ADMIN PROMOTION MANAGEMENT ROUTES
// ============================================================
router.get("/preview", auth, adminOnly, previewPromotions);
router.post("/preview", auth, adminOnly, previewPromotions);

router.get("/", auth, adminOnly, getPromotions);
router.get("/:id", auth, adminOnly, getPromotionById);
router.post("/", auth, adminOnly, createPromotion);
router.put("/:id", auth, adminOnly, updatePromotion);
router.patch("/:id/status", auth, adminOnly, togglePromotionStatus);
router.delete("/:id", auth, adminOnly, deletePromotion);

export default router;

