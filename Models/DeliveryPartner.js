import mongoose from "mongoose";
import Counter from "./Counter.js";

const { Schema } = mongoose;

const DeliveryPartnerSchema = new Schema(
  {
    partnerId: {
      type: String,
      unique: true,
      index: true,
      trim: true,
    },

    fullName: {
      type: String,
      required: [true, "Full name is required"],
      trim: true,
    },

    mobileNumber: {
      type: String,
      required: [true, "Mobile number is required"],
      trim: true,
      index: true,
    },

    avatar: {
      type: String,
      default: "",
      trim: true,
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    availabilityStatus: {
      type: String,
      enum: ["Available", "Busy", "Offline"],
      default: "Available",
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for active & availability filtering
DeliveryPartnerSchema.index({ isActive: 1, availabilityStatus: 1 });
DeliveryPartnerSchema.index({ fullName: "text", mobileNumber: "text" });

/**
 * Pre-save hook: auto-assign sequential partnerId if not provided
 * Example: ZDP-1001, ZDP-1002
 */
DeliveryPartnerSchema.pre("save", async function () {
  if (this.partnerId) return;

  try {
    const counter = await Counter.findOneAndUpdate(
      { _id: "delivery-partner" },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
    );

    const seqNumber = (counter?.seq || 1) + 1000;
    this.partnerId = `ZDP-${seqNumber}`;
  } catch (err) {
    // Fallback: timestamp-based unique ID
    this.partnerId = `ZDP-${Date.now().toString().slice(-6)}`;
  }
});

const DeliveryPartner = mongoose.model("DeliveryPartner", DeliveryPartnerSchema);

export default DeliveryPartner;

