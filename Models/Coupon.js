import mongoose from "mongoose";

const couponSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },

    title: {
      type: String,
      default: "",
      trim: true,
    },

    description: {
      type: String,
      default: "",
    },

    discountType: {
      type: String,
      enum: ["flat", "percentage"],
      required: true,
    },

    discountValue: {
      type: Number,
      required: true,
      min: 0,
    },

    maxDiscount: {
      type: Number,
      default: null,
    },

    minOrderValue: {
      type: Number,
      default: 0,
    },

    maxOrderValue: {
      type: Number,
      default: null,
    },

    usageLimit: {
      type: Number,
      default: null,
    },

    usedCount: {
      type: Number,
      default: 0,
    },

    perUserLimit: {
      type: Number,
      default: 1,
    },

    // --------------------------------
    // AUDIENCE
    // --------------------------------

    audienceType: {
      type: String,
      enum: [
        "everyone",
        "first_order",
        "new_users",
        "existing_users",
        "inactive_users",
        "specific_users",
        "order_count",
        "lifetime_spend",
      ],
      default: "everyone",
    },

    applicableUsers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    // New user = account created within this many days
    newUserDays: {
      type: Number,
      default: 30,
    },

    // Inactive user = no qualifying order for this many days
    inactiveDays: {
      type: Number,
      default: 30,
    },

    minOrders: {
      type: Number,
      default: null,
    },

    maxOrders: {
      type: Number,
      default: null,
    },

    minLifetimeSpend: {
      type: Number,
      default: null,
    },

    maxLifetimeSpend: {
      type: Number,
      default: null,
    },

    // --------------------------------
    // SERVICE TARGETING
    // --------------------------------

    applicableServices: {
      type: [String],
      default: [],
    },

    serviceMatchMode: {
      type: String,
      enum: ["ANY", "ALL"],
      default: "ANY",
    },

    // Minimum value of selected service(s)
    minServiceValue: {
      type: Number,
      default: 0,
    },

    // Discount applies to:
    // complete order OR selected services
    discountScope: {
      type: String,
      enum: ["order", "selected_services"],
      default: "order",
    },

    // --------------------------------
    // PAYMENT
    // --------------------------------

    applicablePaymentMethods: {
      type: [String],
      default: [],
    },

    // --------------------------------
    // VALIDITY
    // --------------------------------

    validFrom: {
      type: Date,
      default: Date.now,
    },

    validUntil: {
      type: Date,
      default: null,
    },

    // --------------------------------
    // FLAGS
    // --------------------------------

    firstOrderOnly: {
      type: Boolean,
      default: false,
    },

    newUsersOnly: {
      type: Boolean,
      default: false,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    autoApply: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

couponSchema.index({ code: 1 });
couponSchema.index({ isActive: 1 });
couponSchema.index({ validFrom: 1, validUntil: 1 });

export default mongoose.model("Coupon", couponSchema);