// backend/models/Order.js

import mongoose from "mongoose";

const { Schema } = mongoose;

const ItemSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
    },

    qty: {
      type: Number,
      required: true,
      min: 1,
    },

    price: {
      type: Number,
      required: true,
      min: 0,
    },

    careLevel: {
      type: String,
      enum: ["regular", "premium"],
      default: "regular",
    },
  },
  { _id: false }
);

// ========================================
// ORDER STATUS
// ========================================

const STATUS_ENUM = [
  "pending",
  "accepted",
  "picked-up",
  "in-progress",
  "ready-for-delivery",
  "out-for-delivery",
  "completed",
  "cancelled",
];

// ========================================
// PAYMENT STATUS
// ========================================

const PAYMENT_STATUS_ENUM = [
  "pending",
  "initiated",
  "paid",
  "failed",
  "refunded",
  "cod",
];

// ========================================
// ORDER SCHEMA
// ========================================

const OrderSchema = new Schema(
  {
    // ========================================
    // ORDER ID
    // ========================================

    orderId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    // ========================================
    // VENDOR
    // ========================================

    vendorId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // ========================================
    // CUSTOMER
    // ========================================

    customerName: {
      type: String,
      default: "Guest",
    },

    customerPhone: {
      type: String,
    },

    customerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },

    // ========================================
    // ORDER ITEMS
    // ========================================

    items: {
      type: [ItemSchema],
      default: [],
    },

    // ========================================
    // ORDER TOTALS
    // ========================================

    total: {
      type: Number,
      min: 0,
      default: 0,
    },

    originalTotal: {
      type: Number,
      default: 0,
    },

    discount: {
      type: Number,
      default: 0,
    },

    deliveryFee: {
      type: Number,
      default: 0,
    },

    handlingFee: {
      type: Number,
      default: 0,
    },

    // ========================================
    // PAYMENT
    // ========================================

    payment: {
      status: {
        type: String,
        enum: PAYMENT_STATUS_ENUM,
        default: "pending",
        index: true,
      },

      method: {
        type: String,
        // UPI, Razorpay, COD, Wallet, etc.
      },

      transactionId: {
        type: String,
        index: true,
      },

      amount: {
        type: Number,
        min: 0,
        default: 0,
      },
    },

    // ========================================
    // ORDER QR CODE
    // ========================================
    //
    // IMPORTANT:
    // These fields are intentionally OUTSIDE
    // the payment object.
    //
    // qrId = random unique token stored in DB
    // qrGeneratedAt = time QR was generated
    // qrLink = optional future scan URL
    // qrExpiresAt = optional future expiry
    //
    // QR image itself is generated at runtime
    // and is NOT stored in MongoDB.
    // ========================================

    qrId: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },

    qrGeneratedAt: {
      type: Date,
      default: null,
    },

    qrLink: {
      type: String,
      default: null,
    },

    qrExpiresAt: {
      type: Date,
      default: null,
    },

    // ========================================
    // PICKUP
    // ========================================

    pickup: {
      date: String,
      time: String,
    },

    // ========================================
    // ADDRESS
    // ========================================

    address: {
      fullAddress: String,
      landmark: String,
      city: String,
      pincode: String,
    },

    // ========================================
    // PAYMENT / REFUND DATES
    // ========================================

    paidAt: {
      type: Date,
    },

    refundedAt: {
      type: Date,
    },

    // ========================================
    // REFUND
    // ========================================

    refund: {
      status: {
        type: String,
        enum: ["none", "processing", "refunded", "failed"],
        default: "none",
      },

      refundId: String,

      amount: Number,

      initiatedAt: Date,

      completedAt: Date,
    },

    // ========================================
    // RATING
    // ========================================

    rating: {
      stars: {
        type: Number,
        min: 1,
        max: 5,
      },

      review: {
        type: String,
        default: "",
      },

      ratedAt: Date,
    },

    // ========================================
    // ORDER STATUS
    // ========================================

    status: {
      type: String,
      enum: STATUS_ENUM,
      default: "pending",
      index: true,
    },

    // ========================================
    // ORDER ACCEPTANCE
    // ========================================

    acceptedAt: {
      type: Date,
      default: null,
    },

    acceptedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // ========================================
    // PICKED / DELIVERED
    // ========================================

    pickedAt: {
      type: Date,
      default: null,
    },

    deliveredAt: {
      type: Date,
      default: null,
    },

    // ========================================
    // NOTES
    // ========================================

    notes: {
      type: String,
    },

    // ========================================
    // META
    // ========================================

    meta: {
      type: Schema.Types.Mixed,
      default: {},
    },

    // ========================================
    // TIMESTAMPS
    // ========================================

    createdAt: {
      type: Date,
      default: Date.now,
    },

    updatedAt: {
      type: Date,
      default: Date.now,
    },

    // ========================================
    // ORDER STATUS HISTORY
    // ========================================

    history: {
      type: [
        {
          status: {
            type: String,
            enum: STATUS_ENUM,
            required: true,
          },

          changedAt: {
            type: Date,
            default: Date.now,
          },

          note: {
            type: String,
          },
        },
      ],

      default: [],
    },
  },
  {
    timestamps: {
      createdAt: "createdAt",
      updatedAt: "updatedAt",
    },
  }
);

// ========================================
// PRE-SAVE HOOK
// Recompute total + payment amount
// + push status history
// ========================================

OrderSchema.pre("save", function (next) {
  try {
    // ----------------------------------------
    // Recompute total
    // ----------------------------------------

    if (Array.isArray(this.items) && this.items.length) {
      const sum = this.items.reduce(
        (acc, it) =>
          acc +
          Number(it.qty || 0) *
            Number(it.price || 0),
        0
      );

      this.total = sum;
    } else {
      this.total = 0;
    }

    // ----------------------------------------
    // Sync payment amount
    // ----------------------------------------

    if (this.payment) {
      this.payment.amount = this.total;

      if (
        this.payment.status === "paid" &&
        !this.payment.paidAt
      ) {
        this.payment.paidAt = new Date();
      }
    }

    // ----------------------------------------
    // Push history entry when status changes
    // ----------------------------------------

    if (
      typeof this.isModified === "function" &&
      this.isModified("status")
    ) {
      this.history = this.history || [];

      this.history.push({
        status: this.status,
        changedAt: new Date(),
      });
    }

    // ----------------------------------------
    // Timestamps
    // ----------------------------------------

    this.updatedAt = new Date();

    if (!this.createdAt) {
      this.createdAt = new Date();
    }

    return next();
  } catch (err) {
    return next(err);
  }
});

// ========================================
// PRE FIND ONE AND UPDATE
//
// Used by findByIdAndUpdate()
// Keeps totals, status history,
// timestamps and payment in sync.
// ========================================

OrderSchema.pre("findOneAndUpdate", function () {
  try {
    const update = this.getUpdate();

    if (!update) return;

    // ========================================
    // STATUS NORMALIZER
    // ========================================

    const normalize = (s) =>
      String(s || "")
        .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");

    // ========================================
    // Ensure $set / $push exist
    // ========================================

    update.$set = update.$set || {};
    update.$push = update.$push || {};

    // ========================================
    // ITEMS -> RECOMPUTE TOTAL
    // ========================================

    const itemsBeingSet =
      (update.$set &&
        Array.isArray(update.$set.items)) ||
      Array.isArray(update.items);

    if (itemsBeingSet) {
      const items = Array.isArray(update.$set.items)
        ? update.$set.items
        : update.items;

      const sum = items.reduce(
        (acc, it) =>
          acc +
          Number(it.qty || 0) *
            Number(it.price || 0),
        0
      );

      update.$set.total = sum;

      // Remove conflicting top-level values
      if (typeof update.total !== "undefined") {
        delete update.total;
      }

      if (typeof update.items !== "undefined") {
        delete update.items;
      }
    }

    // ========================================
    // CANONICALIZE STATUS
    // ========================================

    const rawStatus =
      (update.$set && update.$set.status) ||
      update.status ||
      null;

    let finalStatus = null;

    if (rawStatus) {
      const matched = STATUS_ENUM.find(
        (s) =>
          normalize(s) === normalize(rawStatus)
      );

      finalStatus = matched || rawStatus;

      update.$set.status = finalStatus;

      if (update.status) {
        delete update.status;
      }
    }

    // ========================================
    // PREPARE HISTORY ENTRY
    // ========================================

    const historyEntry = finalStatus
      ? {
          status: finalStatus,
          changedAt: new Date(),
        }
      : null;

    // ========================================
    // RESOLVE HISTORY CONFLICTS
    // ========================================

    const topLevelHistory = Array.isArray(
      update.history
    )
      ? update.history
      : null;

    const setHistory = Array.isArray(
      update.$set.history
    )
      ? update.$set.history
      : null;

    const pushHistory =
      update.$push &&
      update.$push.history
        ? update.$push.history
        : null;

    if (historyEntry) {
      if (topLevelHistory || setHistory) {
        const base = Array.isArray(setHistory)
          ? setHistory.slice()
          : Array.isArray(topLevelHistory)
          ? topLevelHistory.slice()
          : [];

        base.push(historyEntry);

        update.$set.history = base;

        if (update.history) {
          delete update.history;
        }

        if (
          update.$push &&
          update.$push.history
        ) {
          delete update.$push.history;
        }
      } else if (pushHistory) {
        // ----------------------------------------
        // $push.history is already present
        // ----------------------------------------

        if (Array.isArray(pushHistory)) {
          const base = pushHistory.slice();

          base.push(historyEntry);

          update.$set.history = base;

          delete update.$push.history;
        } else if (
          typeof pushHistory === "object" &&
          pushHistory.$each &&
          Array.isArray(pushHistory.$each)
        ) {
          pushHistory.$each.push(historyEntry);

          update.$push.history = pushHistory;
        } else {
          update.$push.history = {
            $each: [
              pushHistory,
              historyEntry,
            ],
          };
        }
      } else {
        // ----------------------------------------
        // No existing history update
        // ----------------------------------------

        update.$push.history = historyEntry;
      }
    }

    // ========================================
    // ACCEPTED AT
    // ========================================

    if (
      finalStatus === "accepted" &&
      !("acceptedAt" in update.$set) &&
      !("acceptedAt" in update)
    ) {
      update.$set.acceptedAt = new Date();

      if (update.acceptedAt) {
        delete update.acceptedAt;
      }
    }

    // ========================================
    // PICKED AT
    // ========================================

    if (
      finalStatus === "in-progress" &&
      !("pickedAt" in update.$set) &&
      !("pickedAt" in update)
    ) {
      update.$set.pickedAt = new Date();

      if (update.pickedAt) {
        delete update.pickedAt;
      }
    }

    // ========================================
    // DELIVERED AT
    // ========================================

    if (
      finalStatus === "completed" &&
      !("deliveredAt" in update.$set) &&
      !("deliveredAt" in update)
    ) {
      update.$set.deliveredAt = new Date();

      if (update.deliveredAt) {
        delete update.deliveredAt;
      }
    }

    // ========================================
    // UPDATED AT
    // ========================================

    update.$set.updatedAt = new Date();

    // ========================================
    // CLEAN CONFLICTING TOP-LEVEL FIELDS
    // ========================================

    if (
      typeof update.total !== "undefined" &&
      typeof update.$set.total !== "undefined"
    ) {
      delete update.total;
    }

    if (
      typeof update.status !== "undefined" &&
      typeof update.$set.status !== "undefined"
    ) {
      delete update.status;
    }

    if (
      typeof update.history !== "undefined" &&
      typeof update.$set.history !== "undefined"
    ) {
      delete update.history;
    }

    // ========================================
    // PAYMENT SYNC
    // ========================================

    if (
      update.$set &&
      update.$set["payment.status"] === "paid"
    ) {
      update.$set["payment.paidAt"] =
        new Date();
    }

    if (
      update.$set &&
      update.$set.total &&
      update.$set["payment.amount"] === undefined
    ) {
      update.$set["payment.amount"] =
        update.$set.total;
    }

    // ========================================
    // WRITE BACK RESOLVED UPDATE
    // ========================================

    this.setUpdate(update);
  } catch (err) {
    console.error(
      "Order pre-findOneAndUpdate error (conflict-resolver):",
      err
    );
  }
});

// ========================================
// STATIC HELPER
// ========================================

OrderSchema.statics.getAllowedStatuses =
  function () {
    return STATUS_ENUM.slice();
  };

// ========================================
// EXPORT
// ========================================

export default mongoose.model("Order", OrderSchema);