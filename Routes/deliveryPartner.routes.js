import express from "express";
import auth from "../Middleware/auth.middleware.js";
import { uploadPartnerAvatar } from "../Middleware/upload.middleware.js";
import {
  getDeliveryPartners,
  getDeliveryPartnerById,
  createDeliveryPartner,
  updateDeliveryPartner,
  togglePartnerStatus,
  deleteDeliveryPartner,
  assignPickupPartner,
  removePickupPartner,
  assignDeliveryPartner,
  updatePickupStatus,
  updateDeliveryStatus,
  getAssignmentsOverview,
} from "../controllers/deliveryPartner.controller.js";

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

// Protect all routes with auth & admin authorization
router.use(auth);
router.use(adminOnly);

// =========================================================
// ASSIGNMENTS OVERVIEW (Declared before /:id)
// =========================================================
router.get("/assignments/overview", getAssignmentsOverview);

// =========================================================
// DELIVERY PARTNER CRUD
// =========================================================
router.get("/", getDeliveryPartners);
router.get("/:id", getDeliveryPartnerById);
router.post("/", uploadPartnerAvatar.single("avatar"), createDeliveryPartner);
router.put("/:id", uploadPartnerAvatar.single("avatar"), updateDeliveryPartner);
router.patch("/:id/status", togglePartnerStatus);
router.delete("/:id", deleteDeliveryPartner);

// =========================================================
// DIRECT ORDER ASSIGNMENT ENDPOINTS
// =========================================================
router.post("/orders/:orderId/assign-pickup", assignPickupPartner);
router.delete("/orders/:orderId/pickup", removePickupPartner);
router.post("/orders/:orderId/assign-delivery", assignDeliveryPartner);
router.patch("/orders/:orderId/pickup-status", updatePickupStatus);
router.patch("/orders/:orderId/delivery-status", updateDeliveryStatus);

export default router;

