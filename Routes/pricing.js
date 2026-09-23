import express from "express";

import auth from "../Middleware/auth.middleware.js";

import {
  getPricing,
  getPricingById,
  createPricing,
  updatePricing,
  togglePricingStatus,
  deletePricing,
} from "../controllers/pricing.controller.js";

const router = express.Router();

/*
 * All pricing management APIs are admin protected.
 */

router.get("/", auth, getPricing);

router.get("/:id", auth, getPricingById);

router.post("/", auth, createPricing);

router.put("/:id", auth, updatePricing);

router.patch(
  "/:id/status",
  auth,
  togglePricingStatus
);

router.delete(
  "/:id",
  auth,
  deletePricing
);

export default router;