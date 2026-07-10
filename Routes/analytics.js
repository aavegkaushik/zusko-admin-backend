// backend/routes/analytics.js
import express from "express"
import mongoose from "mongoose"
import auth from "../middleware/auth.middleware.js"
import Order from "../models/Order.js"

const router = express.Router()
const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id)

/* ---------------- helpers ---------------- */

function buildDateLabels(startDate, endDate) {
  const labels = []
  const cur = new Date(startDate)
  const end = new Date(endDate)
  while (cur <= end) {
    labels.push(cur.toISOString().slice(0, 10))
    cur.setDate(cur.getDate() + 1)
  }
  return labels
}

/** base match with correct ObjectId usage */
function buildBaseMatch(req) {
  const isVendor = req.user?.role === "vendor"
  const requestedVendorId = req.query.vendorId
  const baseMatch = {}

  if (isVendor) {
    baseMatch.vendorId = new mongoose.Types.ObjectId(req.user.id)
  } else if (requestedVendorId) {
    if (!isValidObjectId(requestedVendorId)) {
      throw new Error("Invalid vendorId")
    }
    baseMatch.vendorId = new mongoose.Types.ObjectId(requestedVendorId)
  }

  return baseMatch
}

function parseRangeSafe(startQ, endQ, defaultDays = 30) {
  const now = new Date()

  if (!startQ || !endQ) {
    const end = now
    const start = new Date(now.getTime() - defaultDays * 24 * 60 * 60 * 1000)
    end.setHours(23, 59, 59, 999)
    return { start, end }
  }

  const start = new Date(startQ)
  const end = new Date(endQ)
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new Error("Invalid start or end date")
  }

  end.setHours(23, 59, 59, 999)
  return { start, end }
}

/* ---------------- series builders ---------------- */

async function buildDaySeries(baseMatch) {
  const now = new Date()
  const from = new Date(now.getTime() - 24 * 60 * 60 * 1000)

  const agg = await Order.aggregate([
    { $match: { ...baseMatch, createdAt: { $gte: from } } },
    { $group: { _id: { hour: { $hour: "$createdAt" } }, count: { $sum: 1 } } },
    { $sort: { "_id.hour": 1 } }
  ])

  return Array.from({ length: 24 }).map((_, i) => {
    const found = agg.find(a => a._id.hour === i)
    return { label: `${i}:00`, count: found ? found.count : 0 }
  })
}

async function buildDailySeries(baseMatch, start, end) {
  const agg = await Order.aggregate([
    { $match: { ...baseMatch, createdAt: { $gte: start, $lte: end } } },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        count: { $sum: 1 },
        revenue: { $sum: { $ifNull: ["$total", 0] } }
      }
    },
    { $sort: { _id: 1 } }
  ])

  const labels = buildDateLabels(start, end)
  return labels.map(d => {
    const f = agg.find(x => x._id === d)
    return {
      date: d,
      orders: f ? f.count : 0,
      revenue: f ? f.revenue : 0
    }
  })
}

async function computeTotals(baseMatch) {
  const byStatusAgg = await Order.aggregate([
    { $match: baseMatch },
    { $group: { _id: "$status", count: { $sum: 1 } } }
  ])

  const byStatus = {}
  let totalOrders = 0

  byStatusAgg.forEach(s => {
    byStatus[s._id || "unknown"] = s.count
    totalOrders += s.count
  })

  const revenueAgg = await Order.aggregate([
    { $match: baseMatch },
    {
      $group: {
        _id: null,
        grossRevenue: { $sum: { $ifNull: ["$total", 0] } },
        avgOrderValue: { $avg: { $ifNull: ["$total", 0] } }
      }
    }
  ])

  const r = revenueAgg[0] || { grossRevenue: 0, avgOrderValue: 0 }

  return {
    totalOrders,
    byStatus,
    grossRevenue: r.grossRevenue,
    avgOrderValue: r.avgOrderValue
  }
}

/* ---------------- routes ---------------- */

router.get("/", auth, async (req, res) => {
  try {
    const baseMatch = buildBaseMatch(req)
    const now = new Date()

    const day = await buildDaySeries(baseMatch)

    const weekStart = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000)
    const week = (await buildDailySeries(baseMatch, weekStart, now))
      .map(x => ({ label: x.date, count: x.orders }))

    const monthStart = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000)
    const month = (await buildDailySeries(baseMatch, monthStart, now))
      .map(x => ({ label: x.date, count: x.orders }))

    const totals = await computeTotals(baseMatch)

    res.json({ day, week, month, totals })
  } catch (err) {
    console.error("Analytics error:", err)
    res.status(500).json({ message: err.message || "Server error" })
  }
})

router.get("/summary", auth, async (req, res) => {
  try {
    const baseMatch = buildBaseMatch(req)
    const { start, end } = req.query
    const range = parseRangeSafe(start, end)
    const totals = await computeTotals({ ...baseMatch, createdAt: range })
    res.json({ ok: true, data: totals })
  } catch (err) {
    console.error("Analytics summary error:", err)
    res.status(400).json({ message: err.message })
  }
})

router.get("/orders", auth, async (req, res) => {
  try {
    const baseMatch = buildBaseMatch(req)
    const { start, end } = req.query
    const { start: s, end: e } = parseRangeSafe(start, end)
    const data = await buildDailySeries(baseMatch, s, e)
    res.json({ ok: true, data })
  } catch (err) {
    console.error("Analytics orders error:", err)
    res.status(400).json({ message: err.message })
  }
})

router.get("/status-distribution", auth, async (req, res) => {
  try {
    const baseMatch = buildBaseMatch(req)
    const { start, end } = req.query
    const range = parseRangeSafe(start, end)

    const agg = await Order.aggregate([
      { $match: { ...baseMatch, createdAt: range } },
      { $group: { _id: "$status", count: { $sum: 1 } } }
    ])

    res.json({
      ok: true,
      data: agg.map(a => ({ status: a._id || "unknown", count: a.count }))
    })
  } catch (err) {
    console.error("Analytics status error:", err)
    res.status(400).json({ message: err.message })
  }
})

export default router