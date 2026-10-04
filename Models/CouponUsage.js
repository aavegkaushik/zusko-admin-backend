import mongoose from "mongoose";

const couponUsageSchema = new mongoose.Schema(
  {
    couponId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Coupon",
      required: true,
      index: true,
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null,
      index: true,
    },

    discountAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    status: {
      type: String,
      enum: ["used", "cancelled", "refunded"],
      default: "used",
    },

    usedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// IMPORTANT:
// Don't use unique { couponId, userId }
// because perUserLimit can be > 1.

couponUsageSchema.index({
  couponId: 1,
  userId: 1,
});

couponUsageSchema.index({
  couponId: 1,
  status: 1,
});

export default mongoose.model("CouponUsage", couponUsageSchema);