import express from "express";
import {
  razorpayWebhook,
  getPaymentStatus,
} from "../Controllers/payment.js";

import auth from "../Middleware/auth.middleware.js";

const router = express.Router();

// Generate QR
// router.post("/generate-qr/:id", auth, generateQR);

// Get Payment Status
router.get("/status/:id", auth, getPaymentStatus);

export default router;