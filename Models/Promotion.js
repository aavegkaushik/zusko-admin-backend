import mongoose from "mongoose";

const promotionSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Promotion name is required"],
      trim: true,
    },

    description: {
      type: String,
      default: "",
      trim: true,
    },

    badgeText: {
      type: String,
      default: "",
      trim: true,
    },

    discountType: {
      type: String,
      enum: {
        values: ["percentage", "flat"],
        message: "discountType must be either 'percentage' or 'flat'",
      },
      required: [true, "Discount type is required"],
    },

    discountValue: {
      type: Number,
      required: [true, "Discount value is required"],
      min: [0, "Discount value cannot be negative"],
    },

    // Optional cap for percentage discounts (e.g., 50% up to ₹100)
    maxDiscount: {
      type: Number,
      default: null,
      min: [0, "Max discount cannot be negative"],
    },

    // Optional minimum order value if applied at cart level
    minOrderValue: {
      type: Number,
      default: 0,
      min: [0, "Min order value cannot be negative"],
    },

    applicableTo: {
      type: String,
      enum: {
        values: ["all", "categories", "items"],
        message: "applicableTo must be 'all', 'categories', or 'items'",
      },
      default: "all",
      required: true,
    },

    applicableCategories: {
      type: [
        {
          type: String,
          enum: ["Men", "Women", "Kids", "Household"],
        },
      ],
      default: [],
    },

    applicableServices: {
      type: [
        {
          type: String,
          enum: [
            "Wash & Fold",
            "Wash & Iron",
            "Dry Clean",
            "Steam Iron",
            "Commercial Laundry",
          ],
        },
      ],
      default: [],
    },

    applicableItems: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Pricing",
      },
    ],

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    startDate: {
      type: Date,
      default: null,
    },

    endDate: {
      type: Date,
      default: null,
    },

    allowCouponStacking: {
      type: Boolean,
      default: false,
    },

    // Higher number = higher priority when resolving conflicts between multiple promotions
    priority: {
      type: Number,
      default: 0,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for high-performance querying
promotionSchema.index({ isActive: 1, priority: -1 });
promotionSchema.index({ startDate: 1, endDate: 1 });
promotionSchema.index({ applicableTo: 1, isActive: 1 });

const Promotion = mongoose.model("Promotion", promotionSchema);

export default Promotion;

