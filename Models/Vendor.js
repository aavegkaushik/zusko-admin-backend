// models/User.js (ESM)
import mongoose from "mongoose"

const VendorSchema = new mongoose.Schema({
  name: String,
  email: String,
  password: {type: String, require: true},
  isActive: {type: Boolean, default: true},
  avatar: {
      type: String,
      default: "",
    },
  role: { type: String, enum: ["admin", "vendor", "customer"], default: "vendor" },

  // Added for Settings Section
  storeName: { type: String, default: "" },
  storeAddress: { type: String, default: "" },
  storePhone: { type: String, default: "" },

  notifications: {
    orderUpdates: { type: Boolean, default: true },
    marketing: { type: Boolean, default: true },
  },
});

export default mongoose.models.Vendor || mongoose.model("Vendor", VendorSchema)
