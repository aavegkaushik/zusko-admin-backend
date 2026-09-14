import mongoose from "mongoose";

const { Schema } = mongoose;

// ========================================
// PROCESSING SESSION
// ========================================
//
// Ek session = ek time par staff jis order
// ko process kar raha hai.
//
// Example:
//
// Session
//   ↓
// Order: ZSK1001
//   ↓
// Staff scans QR
//   ↓
// Backend verifies QR belongs to ZSK1001
//
// ========================================

const ProcessingSessionSchema = new Schema(
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

    // Human-readable order number
    // Example: ZSK1782628835098775

    orderNumber: {
      type: String,
      required: true,
      index: true,
    },

    // ========================================
    // STARTED BY
    // ========================================

    startedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // ========================================
    // SESSION STATUS
    // ========================================

    status: {
      type: String,
      enum: [
        "active",
        "completed",
        "cancelled",
      ],
      default: "active",
      index: true,
    },

    // ========================================
    // SESSION TIME
    // ========================================

    startedAt: {
      type: Date,
      default: Date.now,
    },

    completedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// ========================================
// EXPORT
// ========================================

export default
  mongoose.models.ProcessingSession ||
  mongoose.model(
    "ProcessingSession",
    ProcessingSessionSchema
  );