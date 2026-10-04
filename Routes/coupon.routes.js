import express from "express";

import auth from "../Middleware/auth.middleware.js";

import {
  getAdminCoupons,
  getAdminCoupon,
  createCoupon,
  updateCoupon,
  toggleCoupon,
  deleteCoupon,
  getCouponUsage,
  getCouponAnalytics,
} from "../controllers/coupon.controller.js";

const router = express.Router();

const adminOnly = (req, res, next) => {
  if (req.user?.role !== "vendor") {
    return res.status(403).json({
      success: false,
      message: "Admin access required",
    });
  }

  next();
};

// ======================================================
// ADMIN COUPON ROUTES
// ======================================================

router.get("/", auth, adminOnly, getAdminCoupons);

router.get("/analytics", auth, adminOnly, getCouponAnalytics);

router.get("/:id", auth, adminOnly, getAdminCoupon);

router.get("/:id/usage", auth, adminOnly, getCouponUsage);

router.post("/", auth, adminOnly, createCoupon);

router.put("/:id", auth, adminOnly, updateCoupon);

router.patch("/:id/toggle", auth, adminOnly, toggleCoupon);

router.delete("/:id", auth, adminOnly, deleteCoupon);

export default router;