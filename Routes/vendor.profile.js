import express from "express";
import auth from "../Middleware/auth.middleware.js";
import Vendor from "../Models/Vendor.js";
import { uploadAvatar } from "../middleware/upload.middleware.js";

const router = express.Router();

/**
 * PATCH /api/vendors/me
 * Vendor can update ONLY name & avatar
 */
router.patch(
  "/me",
  auth,
  uploadAvatar.single("avatar"),
  async (req, res) => {
    try {
      const updates = {};

      if (req.body.name) {
        updates.name = req.body.name.trim();
      }

      if (req.file) {
        updates.avatar = `/uploads/avatars/${req.file.filename}`;
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ message: "Nothing to update" });
      }

      const vendor = await Vendor.findByIdAndUpdate(
        req.user.id,
        { $set: updates },
        { new: true }
      ).select("name email avatar");

      res.json({ ok: true, vendor });
    } catch (err) {
      console.error("Profile update error:", err);
      res.status(500).json({ message: "Failed to update profile" });
    }
  }
);

export default router;
