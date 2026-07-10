import express from "express";
import { razorpayWebhook } from "../controllers/payment.js";

const router = express.Router();

// Razorpay needs RAW body
router.post(
  "/",
  express.raw({
    type: "application/json",
  }),
  razorpayWebhook
);

export default router;