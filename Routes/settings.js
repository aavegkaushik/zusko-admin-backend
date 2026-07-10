import express from "express";
import bcrypt from "bcryptjs";
import auth from "../middleware/auth.middleware.js";
import User from "../Models/Vendor.js";

const router = express.Router();

// -----------------------------
// GET My Settings
// -----------------------------
router.get("/", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user) return res.status(404).json({ message: "Vendor not found" });

    res.json({ ok: true, data: user });
  } catch (err) {
    console.error("/settings GET error", err);
    res.status(500).json({ message: "Server error" });
  }
});

// -----------------------------
// UPDATE Profile + Store Info
// -----------------------------
router.put("/", auth, async (req, res) => {
  try {
    const allowed = [
      "name",
      "storeName",
      "storeAddress",
      "storePhone",
      "notifications",
    ];

    const updateData = {};
    allowed.forEach((key) => {
      if (req.body[key] !== undefined) updateData[key] = req.body[key];
    });

    const updated = await User.findByIdAndUpdate(req.user.id, updateData, {
      new: true,
      runValidators: true,
    }).select("-password");

    res.json({ ok: true, data: updated });
  } catch (err) {
    console.error("/settings PUT error", err);
    res.status(500).json({ message: "Server error" });
  }
});

// -----------------------------
// CHANGE PASSWORD
// -----------------------------
router.put("/change-password", auth, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword)
      return res.status(400).json({ message: "Missing fields" });

    const user = await User.findById(req.user.id);

    const match = await bcrypt.compare(oldPassword, user.password);
    if (!match) return res.status(400).json({ message: "Incorrect old password" });

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();

    return res.json({ ok: true, message: "Password updated" });
  } catch (err) {
    console.error("/settings/change-password error", err);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
