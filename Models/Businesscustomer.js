import mongoose from "mongoose";

/**
 * NOTE: The prompt states a Business CRM already exists, which implies
 * this model is already defined somewhere in the project. It's included
 * here, matching the BusinessLead field set, so that acceptQuote() in
 * businessQuote.controller.js is fully functional out of the box.
 * If a BusinessCustomer model already exists in your codebase, delete
 * this file and just make sure the field names line up (or adjust the
 * mapping inside acceptQuote()).
 */
const businessCustomerSchema = new mongoose.Schema(
  {
    businessName: {
      type: String,
      required: true,
      trim: true,
    },
    website: {
      type: String,
      trim: true,
    },
    ownerName: {
      type: String,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
    },
    city: {
      type: String,
      trim: true,
    },
    address: {
      type: String,
      trim: true,
    },
    businessType: {
      type: String,
      trim: true,
    },

    // Link back to the originating lead + the quote that converted them
    leadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BusinessLead",
    },
    convertedFromQuote: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BusinessQuote",
    },

    activeServices: {
      type: [String],
      default: [],
    },

    pickupFrequency: {
      type: String,
      trim: true,
    },

    status: {
      type: String,
      enum: ["ACTIVE", "PAUSED", "CHURNED"],
      default: "ACTIVE",
    },
  },
  {
    timestamps: true,
  }
);

const BusinessCustomer = mongoose.model(
  "BusinessCustomer",
  businessCustomerSchema
);

export default BusinessCustomer;