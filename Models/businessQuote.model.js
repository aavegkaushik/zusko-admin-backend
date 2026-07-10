import mongoose from "mongoose";

/**
 * QUOTE_STATUS
 * Draft     -> being built by admin, not yet sent
 * Sent      -> emailed to the business, awaiting response
 * Accepted  -> business accepted, converts to a customer
 * Rejected  -> business declined
 * Expired   -> validTill date has passed without a response
 */
export const QUOTE_STATUS = [
  "Draft",
  "Sent",
  "Accepted",
  "Rejected",
  "Expired",
];

/**
 * Single service line item on a quote.
 * subtotal is stored (not just derived) so historical quotes remain
 * accurate even if pricing logic changes later.
 */
const serviceItemSchema = new mongoose.Schema(
  {
    serviceName: {
      type: String,
      required: true,
      trim: true,
    },
    unit: {
      type: String, // e.g. "kg", "piece", "sq.ft", "set"
      required: true,
      trim: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    minimumQuantity: {
      type: Number,
      default: 0,
      min: 0,
    },
    quantity: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    subtotal: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
  },
  { _id: false }
);

/**
 * Arbitrary extra line items (e.g. "Express handling", "Fabric softener add-on")
 */
const additionalChargeSchema = new mongoose.Schema(
  {
    label: {
      type: String,
      required: true,
      trim: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: false }
);

const businessQuoteSchema = new mongoose.Schema(
  {
    leadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BusinessLead",
      required: true,
      index: true,
    },

    quoteNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
      // e.g. ZBQ-2026-00001
    },

    status: {
      type: String,
      enum: QUOTE_STATUS,
      default: "Draft",
      index: true,
    },

    validTill: {
      type: Date,
      required: true,
    },

    paymentTerms: {
      type: String,
      trim: true,
      default: "50% advance, balance on delivery",
    },

    turnaroundTime: {
      type: String,
      trim: true,
      default: "24-48 hours",
    },

    pickupFrequency: {
      type: String,
      trim: true,
    },

    services: {
      type: [serviceItemSchema],
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length > 0,
        message: "A quote must have at least one service line item.",
      },
    },

    // Sum of all service subtotals, before discount/GST/charges
    subtotal: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    // Flat OR percentage discount, applied on subtotal
    discount: {
      type: {
        type: String,
        enum: ["flat", "percentage"],
        default: "percentage",
      },
      value: {
        type: Number,
        default: 0,
        min: 0,
      },
      amount: {
        type: Number,
        default: 0,
        min: 0,
      },
    },

    gst: {
      percentage: {
        type: Number,
        default: 18,
        min: 0,
      },
      amount: {
        type: Number,
        default: 0,
        min: 0,
      },
    },

    pickupCharge: {
      type: Number,
      default: 0,
      min: 0,
    },

    additionalCharges: {
      type: [additionalChargeSchema],
      default: [],
    },

    grandTotal: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    notes: {
      type: String,
      trim: true,
    },

    terms: {
      type: String,
      trim: true,
      default:
        "Quote valid until the date mentioned above. Prices are subject to change post expiry. Turnaround time may vary based on order volume and service type.",
    },

    pdfUrl: {
      type: String,
      trim: true,
    },

    sentAt: Date,
    acceptedAt: Date,
    rejectedAt: Date,

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
);

businessQuoteSchema.index({ createdAt: -1 });

const BusinessQuote = mongoose.model(
  "BusinessQuote",
  businessQuoteSchema
);

export default BusinessQuote;