import mongoose from "mongoose";

const { Schema } = mongoose;

// ========================================
// ORDER SCAN SCHEMA
// ========================================

const OrderScanSchema = new Schema(
  {
    // ========================================
    // ORDER
    // ========================================

    orderId: {
      type: Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },

    // Human-readable Order ID
    // Example: ZSK1782628835098775
    orderNumber: {
      type: String,
      required: true,
      index: true,
    },

    // ========================================
    // QR
    // ========================================

    qrId: {
      type: String,
      required: true,
      index: true,
    },

    // ========================================
    // SCAN STAGE
    // ========================================

    stage: {
      type: String,
      enum: [
        "pickup",
        "accepted",
        "processing",
        "quality-check",
        "ready-for-delivery",
        "out-for-delivery",
        "completed",
      ],
      required: true,
      index: true,
    },

    // ========================================
    // SCANNED BY
    // ========================================

    scannedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // ========================================
    // RESULT
    // ========================================

    result: {
      type: String,
      enum: [
        "match",
        "mismatch",
        "invalid",
      ],
      required: true,
      index: true,
    },

    // ========================================
    // OPTIONAL MESSAGE
    // ========================================

    message: {
      type: String,
      default: "",
    },

    // ========================================
    // OPTIONAL EXPECTED ORDER
    //
    // Useful later for anti-mixing.
    //
    // Example:
    // Expected = ZSK1001
    // Scanned  = ZSK1002
    // ========================================

    expectedOrderId: {
      type: Schema.Types.ObjectId,
      ref: "Order",
      default: null,
    },

    expectedOrderNumber: {
      type: String,
      default: null,
    },

    // ========================================
    // SCAN TIME
    // ========================================

    scannedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// ========================================
// EXPORT
// ========================================

export default mongoose.model("OrderScan", OrderScanSchema);