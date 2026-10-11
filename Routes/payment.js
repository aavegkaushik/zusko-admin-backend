import express from "express";

import {
  generateQR,
  getPaymentStatus,
  razorpayWebhook,
} from "../controllers/payment.js";

import auth from "../Middleware/auth.middleware.js";

const router = express.Router();

// Admin generates QR for an order.
// Add your existing admin-role middleware here if auth
// only checks whether the user is logged in.
router.post("/generate-qr/:id", auth, generateQR);

// Payment status
router.get("/status/:id", auth, getPaymentStatus);

// Webhook signature verification happens in the controller.
// Keep this endpoint public to Razorpay.
router.post("/razorpay/webhook", razorpayWebhook);

export default router;