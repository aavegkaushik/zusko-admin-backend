// backend/routes/orders.js (ESM)
// Enforces: customers (or public API) create orders; vendors only view and update status.

import express from "express"
import mongoose from "mongoose"
import auth from "../Middleware/auth.middleware.js" // expects req.user when provided
import Order from "../Models/Order.js"
import { sendEmail } from "../utils/sendmail.js";
import { generateDeliveredEmail } from "../utils/orderEmails.js";
import { emitToVendor } from "../socket.js";
const router = express.Router()

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id)

// Allowed statuses and simple transition guard (optional)
const ALLOWED_STATUSES = [
  "pending",
  "accepted",
  "picked-up",
  "in-progress",
  "ready-for-delivery",
  "out-for-delivery",
  "completed",
  "cancelled"
]

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

    const order = await Order.create(payload);

/**
 * Notify the vendor/admin dashboard immediately.
 *
 * The vendor room is based on order.vendorId.
 */
emitToVendor(order.vendorId, "new_order", {
  success: true,

  order: {
    _id: order._id,
    orderId: order.orderId,
    vendorId: order.vendorId,

    customerName: order.customerName,
    customerPhone: order.customerPhone,
    customerEmail: order.customerEmail,

    items: order.items,

    total: order.total,
    originalTotal: order.originalTotal,
    discount: order.discount,
    deliveryFee: order.deliveryFee,
    handlingFee: order.handlingFee,

    pickup: order.pickup,
    address: order.address,

    payment: order.payment,

    status: order.status,

    createdAt: order.createdAt,
  },
});

console.log(
  `🔔 New order event emitted for vendor ${order.vendorId}`
);

return res.status(201).json({
  message: "Order created",
  data: order,
});
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

// =========================================================
// REALTIME ORDER STATUS UPDATE
// Notify vendor dashboard immediately
// =========================================================

if (updated?.vendorId) {
  emitToVendor(
    updated.vendorId,
    "order_status_updated",
    {
      success: true,

      orderId: String(updated._id),

      order: updated,

      status: updated.status,

      updatedAt: updated.updatedAt,

      isPending: updated.status === "pending",
    }
  );

  console.log(
    `📡 Realtime status emitted: ${
      updated.orderId || updated._id
    } → ${updated.status}`
  );
}

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

// POST /api/orders/:id/accept
// Accept a pending order
// Only admin/vendor can accept.
// Vendor can only accept their own order.
// IMPORTANT:
// Uses atomic findOneAndUpdate so two dashboard tabs
// cannot accept the same pending order simultaneously.
router.post("/:id/accept", auth, async (req, res) => {
  try {
    const { id } = req.params

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        message: "Invalid order id",
      })
    }

    // Only admin/vendor can accept orders
    if (!["admin", "vendor"].includes(req.user.role)) {
      return res.status(403).json({
        message: "Only admin or vendor can accept orders",
      })
    }

    // Atomically change ONLY pending -> accepted
    //
    // If another request already accepted this order,
    // this query returns null.
    const updated = await Order.findOneAndUpdate(
      {
        _id: id,
        status: "pending",

        // Vendor can only accept their own order.
        ...(req.user.role === "vendor"
          ? { vendorId: req.user.id }
          : {}),
      },
      {
        $set: {
          status: "accepted",
          acceptedAt: new Date(),
          acceptedBy: req.user.id,
          updatedAt: new Date(),
        },
      },
      {
        new: true,
        runValidators: true,
      }
    ).lean()

    // =========================================================
// REALTIME STATUS UPDATE
// Notify vendor dashboard immediately
// =========================================================

// emitToVendor(
//   updated.vendorId,
//   "order_status_updated",
//   {
//     success: true,

//     orderId: String(updated._id),

//     order: updated,

//     status: updated.status,

//     updatedAt: updated.updatedAt,

//     // Used by frontend to stop pending-order notification
//     isPending:
//       updated.status === "pending",
//   }
// );

    // Order was already accepted / cancelled / moved forward
    // OR vendor doesn't own it.
    if (!updated) {
  const existingOrder = await Order.findById(id)
    .select("status vendorId")
    .lean();

  if (!existingOrder) {
    return res.status(404).json({
      message: "Order not found",
    });
  }

  if (
    req.user.role === "vendor" &&
    String(existingOrder.vendorId) !==
      String(req.user.id)
  ) {
    return res.status(403).json({
      message: "You are not allowed to accept this order",
    });
  }

  if (existingOrder.status !== "pending") {
    return res.status(409).json({
      message: `Order cannot be accepted because it is already ${existingOrder.status}`,
      status: existingOrder.status,
    });
  }

  return res.status(409).json({
    message: "Order could not be accepted",
  });
}

// =========================================================
// NOW UPDATED ORDER DEFINITELY EXISTS
// =========================================================

emitToVendor(
  updated.vendorId,
  "order_status_updated",
  {
    success: true,
    orderId: String(updated._id),
    order: updated,
    status: updated.status,
    updatedAt: updated.updatedAt,
    isPending: false,
  }
);

    // =========================================================
// NOTIFY DASHBOARD THAT ORDER WAS ACCEPTED
// =========================================================

emitToVendor(
  updated.vendorId,
  "order_accepted",
  {
    success: true,

    orderId: String(
      updated._id
    ),

    acceptedAt:
      updated.acceptedAt,

    acceptedBy:
      updated.acceptedBy,

    status:
      updated.status,
  }
);

console.log(
  `✅ Order accepted event emitted for vendor ${updated.vendorId}`
);

    console.log(
      `Order ${updated.orderId || updated._id} accepted by ${req.user.email || req.user.id}`
    )

    return res.json({
      success: true,
      message: "Order accepted successfully",
      data: updated,
    })
  } catch (err) {
    console.error("POST /api/orders/:id/accept error:", err)

    return res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message,
    })
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
