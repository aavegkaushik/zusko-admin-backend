// backend/routes/vendorStats.js (ESM)
import express from "express"
import mongoose from "mongoose"
import auth from "../Middleware/auth.middleware.js"
import Order from "../Models/Order.js"

const router = express.Router()

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id)

/**
 * GET /api/vendors/:vendorId/stats
 * Requires auth. Vendor may fetch only their own stats. Admin can fetch any vendor.
 * Returns:
 *  - totals: totalOrders, totalEarnings, byStatus
 *  - day/week/month series of order count & earnings
 */
router.get("/:vendorId/stats", auth, async (req, res) => {
  try {
    const { vendorId } = req.params
    if (!isValidObjectId(vendorId)) return res.status(400).json({ message: "Invalid vendorId" })

    // authorization: vendor must only access their own stats
    if (req.user.role === "vendor" && String(req.user.id) !== String(vendorId)) {
      return res.status(403).json({ message: "Forbidden" })
    }

    const now = new Date()

    // totals & by status
    const totalsAgg = await Order.aggregate([
      { $match: { vendorId: mongoose.Types.ObjectId(vendorId) } },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          earnings: { $sum: { $ifNull: ["$total", 0] } }
        }
      }
    ])
    let totalOrders = 0, totalEarnings = 0
    const byStatus = {}
    totalsAgg.forEach(r => {
      byStatus[r._id] = { count: r.count, earnings: r.earnings }
      totalOrders += r.count
      totalEarnings += r.earnings
    })

    // day series - last 24 hours (by hour)
    const dayFrom = new Date(now.getTime() - 24*60*60*1000)
    const dayAgg = await Order.aggregate([
      { $match: { vendorId: mongoose.Types.ObjectId(vendorId), createdAt: { $gte: dayFrom } } },
      { $group: { _id: { hour: { $hour: "$createdAt" } }, count: { $sum: 1 }, earnings: { $sum: { $ifNull: ["$total", 0] } } } },
      { $sort: { "_id.hour": 1 } }
    ])
    const daySeries = Array.from({length:24}).map((_,i) => {
      const found = dayAgg.find(x => (x._id.hour ?? x._id) === i)
      return { label: `${i}:00`, count: found ? found.count : 0, earnings: found ? found.earnings : 0 }
    })

    // week series - last 7 days
    const weekFrom = new Date(now.getTime() - 7*24*60*60*1000)
    const weekAgg = await Order.aggregate([
      { $match: { vendorId: mongoose.Types.ObjectId(vendorId), createdAt: { $gte: weekFrom } } },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 }, earnings: { $sum: { $ifNull: ["$total", 0] } } } },
      { $sort: { "_id": 1 } }
    ])
    const weekSeries = []
    for (let i=6;i>=0;i--) {
      const d = new Date(now.getTime() - i*24*60*60*1000)
      const key = d.toISOString().slice(0,10)
      const found = weekAgg.find(x => x._id === key)
      weekSeries.push({ label: key, count: found ? found.count : 0, earnings: found ? found.earnings : 0 })
    }

    // month series - last 30 days
    const monthFrom = new Date(now.getTime() - 30*24*60*60*1000)
    const monthAgg = await Order.aggregate([
      { $match: { vendorId: mongoose.Types.ObjectId(vendorId), createdAt: { $gte: monthFrom } } },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 }, earnings: { $sum: { $ifNull: ["$total", 0] } } } },
      { $sort: { "_id": 1 } }
    ])
    const monthSeries = []
    for (let i=29;i>=0;i--) {
      const d = new Date(now.getTime() - i*24*60*60*1000)
      const key = d.toISOString().slice(0,10)
      const found = monthAgg.find(x => x._id === key)
      monthSeries.push({ label: key, count: found ? found.count : 0, earnings: found ? found.earnings : 0 })
    }

    return res.json({
      totalOrders,
      totalEarnings,
      byStatus,
      daySeries,
      weekSeries,
      monthSeries
    })
  } catch (err) {
    console.error("/api/vendors/:vendorId/stats error:", err)
    res.status(500).json({ message: "Server error", error: err.message })
  }
})

export default router
