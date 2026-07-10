// backend/routes/orders.js (ESM)
// Enforces: customers (or public API) create orders; vendors only view and update status.

import express from "express"
import mongoose from "mongoose"
import auth from "../Middleware/auth.middleware.js" // expects req.user when provided
import Order from "../Models/Order.js"
import { sendEmail } from "../utils/sendmail.js";
import { generateDeliveredEmail } from "../utils/orderEmails.js";

const router = express.Router()

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id)

// Allowed statuses and simple transition guard (optional)
const ALLOWED_STATUSES = ["pending","picked-up", "in-progress", "ready-for-delivery", "out-for-delivery", "completed", "cancelled"]

// ---------------------------
// GET /api/orders
// Vendor: sees only their orders
// Admin: can see all (or filter by vendorId)
// ---------------------------
router.get("/", auth, async (req, res) => {
  try {

    const isVendor = req.user.role === "vendor"
    const { page = 1, limit = 25, status, vendorId, start, end, sort = "-createdAt" } = req.query
    const p = Math.max(1, parseInt(page, 10) || 1)
    const l = Math.min(500, Math.max(1, parseInt(limit, 10) || 25))

    const filter = {}

    // if (isVendor) {
    //   // vendors can only fetch their own orders
    //   filter.vendorId = req.user.id
    // } else if (vendorId) {
    //   if (!isValidObjectId(vendorId)) return res.status(400).json({ message: "Invalid vendorId" })
    //   filter.vendorId = vendorId
    // }

    if (status) filter.status = status

    if (start || end) {
      filter.createdAt = {}
      if (start) {
        const s = new Date(start)
        if (isNaN(s)) return res.status(400).json({ message: "Invalid start date" })
        filter.createdAt.$gte = s
      }
      if (end) {
        const e = new Date(end)
        if (isNaN(e)) return res.status(400).json({ message: "Invalid end date" })
        e.setHours(23, 59, 59, 999)
        filter.createdAt.$lte = e
      }
      if (Object.keys(filter.createdAt).length === 0) delete filter.createdAt
    }

    const total = await Order.countDocuments(filter)
    const orders = await Order.find(filter).sort(sort).skip((p - 1) * l).limit(l).lean()

    res.json({
      meta: { page: p, limit: l, total, pages: Math.ceil(total / l) },
      data: orders,
    })
  } catch (err) {
    console.error("GET /api/orders error:", err)
    res.status(500).json({ message: "Server error", error: err.message })
  }
})

// ---------------------------
// GET /api/orders/:id
// Vendor only their orders
// ---------------------------
router.get("/:id", auth, async (req, res) => {
  try {
    const { id } = req.params
    if (!isValidObjectId(id)) return res.status(400).json({ message: "Invalid order id" })

    const order = await Order.findById(id).lean()
    if (!order) return res.status(404).json({ message: "Order not found" })

    // if (req.user.role === "vendor" && String(order.vendorId) !== String(req.user.id)) {
    //   return res.status(403).json({ message: "Forbidden" })
    // }

    res.json({ data: order })
  } catch (err) {
    console.error("GET /api/orders/:id error:", err)
    res.status(500).json({ message: "Server error", error: err.message })
  }
})

// ---------------------------
// POST /api/orders
// Public endpoint (customer app or server creates orders).
// Vendors are NOT allowed to create orders via this endpoint.
// Body must contain vendorId and items, etc.
// ---------------------------
router.post("/", authOptional, async (req, res) => {
  try {
    // If auth provided and role vendor -> forbid
    if (req.user && req.user.role === "vendor") {
      return res.status(403).json({ message: "Vendors are not allowed to create orders" })
    }

    const payload = { ...req.body }

    if (!payload.vendorId) {
      return res.status(400).json({ message: "vendorId is required" })
    }
    if (!isValidObjectId(payload.vendorId)) {
      return res.status(400).json({ message: "vendorId must be a valid id" })
    }

    if (!Array.isArray(payload.items) || payload.items.length === 0) {
      return res.status(400).json({ message: "Items array is required and cannot be empty" })
    }

    // Optional: compute total server-side if not provided
    if (!payload.total) {
      payload.total = payload.items.reduce((s, it) => s + (Number(it.qty || 0) * Number(it.price || 0)), 0)
    }

    // set default status if missing
    payload.status = payload.status || "pending"

    const order = await Order.create(payload)
    return res.status(201).json({ message: "Order created", data: order })
  } catch (err) {
    console.error("POST /api/orders error:", err)
    res.status(500).json({ message: "Server error", error: err.message })
  }
})

// ---------------------------
// PATCH /api/orders/:id/status
// Vendors can update status of their own orders. Admin can update any.
// This version updates via findByIdAndUpdate to avoid triggering pre('save') that may be broken.
// ---------------------------
router.patch("/:id/status", auth, async (req, res) => {
  try {
    const { id } = req.params
    const { status } = req.body

    if (!isValidObjectId(id)) return res.status(400).json({ message: "Invalid order id" })
    if (!status || !ALLOWED_STATUSES.includes(status)) return res.status(400).json({ message: "Invalid status" })

    // fetch current order to check permissions and transition rules
    const order = await Order.findById(id).lean()
    if (!order) return res.status(404).json({ message: "Order not found" })

    // Vendor may only update their orders
    if (req.user.role === "vendor" && String(order.vendorId) !== String(req.user.id)) {
      return res.status(403).json({ message: "Forbidden" })
    }

    // simple transition guard
    if (order.status === "cancelled") {
      return res.status(400).json({ message: "Cannot change status of cancelled order" })
    }

    // Build update object - set fields server-side when necessary
    const update = { status, updatedAt: new Date() }

    if (status === "picked-up" && !order.pickedAt) {
  update.pickedAt = new Date();
}
    if (status === "completed" && !order.deliveredAt) {
      update.deliveredAt = new Date()
    }

    // If you want to record status history on the document and your pre-save is broken,
    // update history here (best-effort). Example:
    // if (Array.isArray(order.history)) {
    //   update.history = [...order.history, { status, changedAt: new Date() }]
    // } else {
    //   update.history = [{ status, changedAt: new Date() }]
    // }

    // apply update using findByIdAndUpdate to avoid triggering pre('save')
    const updated = await Order.findByIdAndUpdate(
  id,
  update,
  {
    returnDocument: "after",
    runValidators: true,
  }
).lean();

if (
    status === "cancelled" &&
    updated.payment?.status === "paid"
) {

    updated.refund = {
        status: "processing",
        amount: updated.payment.amount,
        initiatedAt: new Date(),
    };

    await updated.save();

    await refundPayment(updated);

}

// Send delivery email
if (
  status === "completed" &&
  updated.customerEmail
) {
  await sendEmail({
    to: updated.customerEmail,
    from:
      process.env.ORDER_MAIL,
    subject: `Your Zusko Order #${updated.orderId} Has Been Delivered ❤️`,
    html: generateDeliveredEmail(updated),
  });

  console.log(
    `Delivery email sent to ${updated.customerEmail}`
  );
}

return res.json({
  message: "Status updated",
  data: updated,
});
  } catch (err) {
    console.error("PATCH /api/orders/:id/status error:", err)
    return res.status(500).json({ message: "Server error", error: err.message })
  }
})

// ---------------------------
// PUT /api/orders/:id (admin or vendor-owner can update certain fields)
// ---------------------------
router.put("/:id", auth, async (req, res) => {
  try {
    const { id } = req.params
    if (!isValidObjectId(id)) return res.status(400).json({ message: "Invalid order id" })

    const order = await Order.findById(id)
    if (!order) return res.status(404).json({ message: "Order not found" })

    // vendor authorization
    if (req.user.role === "vendor" && String(order.vendorId) !== String(req.user.id)) {
      return res.status(403).json({ message: "Forbidden" })
    }

    // Only admin may change vendorId
    if (req.body.vendorId && req.user.role !== "admin") {
      delete req.body.vendorId
    }

    // apply allowed updates
    const updatable = ["customerName", "customerPhone", "items", "status", "notes", "meta", "vendorId"]
    updatable.forEach((k) => {
      if (Object.prototype.hasOwnProperty.call(req.body, k)) {
        order[k] = req.body[k]
      }
    })

    await order.save()
    res.json({ message: "Order updated", data: order })
  } catch (err) {
    console.error("PUT /api/orders/:id error:", err)
    res.status(500).json({ message: "Server error", error: err.message })
  }
})

// ---------------------------
// DELETE /api/orders/:id (admin only) - keep if needed
// ---------------------------
router.delete("/:id", auth, async (req, res) => {
  try {
    if (req.user.role !== "admin") return res.status(403).json({ message: "Admin only" })
    const { id } = req.params
    if (!isValidObjectId(id)) return res.status(400).json({ message: "Invalid order id" })

    const order = await Order.findByIdAndDelete(id)
    if (!order) return res.status(404).json({ message: "Order not found" })

    res.json({ message: "Order deleted", data: order })
  } catch (err) {
    console.error("DELETE /api/orders/:id error:", err)
    res.status(500).json({ message: "Server error", error: err.message })
  }
})

export default router

// ---------------------------
// Helper middleware: authOptional
// If request has Authorization header, verify; otherwise continue unauthenticated.
// This allows public create order while still detecting attempts by vendor (which we forbid).
// ---------------------------
async function authOptional(req, res, next) {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader) return next();
    // reuse your existing auth middleware logic but avoid circular import; replicate simple verify:
    const jwt = (await import("jsonwebtoken")).default
    const Blacklist = (await import("../models/Blacklist.js").catch(()=>null)).default
    const token = authHeader.startsWith("Bearer ") ? authHeader.split(" ")[1] : null
    if (!token) return next()
    // if you have blacklist model and want to check it, do so:
    if (Blacklist) {
      const blocked = await Blacklist.findOne({ token }).lean().catch(()=>null)
      if (blocked) return res.status(401).json({ ok: false, message: "Token revoked" })
    }
    const payload = jwt.verify(token, process.env.JWT_SECRET)
    req.user = { id: payload.id, email: payload.email, role: payload.role }
    req.token = token
    return next()
  } catch (err) {
    // invalid token -> treat as no auth (or you can reject)
    // We'll reject if token invalid to avoid misuse
    return res.status(401).json({ ok: false, message: "Invalid token" })
  }
}
