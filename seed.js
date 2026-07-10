import mongoose from "mongoose"
import dotenv from "dotenv"
import Order from "./models/Order.js"
import User from "./Models/user.js"

dotenv.config()

const MONGO_URI = process.env.MONGO_URI

// Connect DB
async function connectDB() {
  try {
    await mongoose.connect(MONGO_URI)
    console.log("MongoDB Connected")
  } catch (error) {
    console.error("Mongo Connection Error:", error)
    process.exit(1)
  }
}

// Generate random items
function randomItems() {
  const items = [
    { name: "Shirt", price: 20 },
    { name: "T-shirt", price: 15 },
    { name: "Jeans", price: 40 },
    { name: "Bedsheet", price: 60 },
    { name: "Towel", price: 10 },
  ]

  const count = Math.floor(Math.random() * 3) + 1

  return Array(count)
    .fill(null)
    .map(() => {
      const item = items[Math.floor(Math.random() * items.length)]
      const qty = Math.floor(Math.random() * 4) + 1
      return {
        name: item.name,
        qty,
        price: item.price,
      }
    })
}

// Generate dummy status
function randomStatus() {
  const statuses = [
    "pending",
    "in-progress",
    "ready-for-delivery",
    "out-for-delivery",
    "completed",
  ]
  return statuses[Math.floor(Math.random() * statuses.length)]
}

async function seed() {
  await connectDB()

  // 1️⃣ Get vendor (manually create 1 vendor before running this script)
  const vendor = await User.findOne({ role: "vendor" })
  if (!vendor) {
    console.log("❌ No vendor found! Please register a vendor first.")
    return process.exit(1)
  }

  // 2️⃣ Clear old orders (optional)
  await Order.deleteMany()
  console.log("🗑️ Old orders deleted")

  // 3️⃣ Prepare dummy orders
  const dummyOrders = []

  for (let i = 0; i < 20; i++) {
    const items = randomItems()
    const total = items.reduce((s, it) => s + it.qty * it.price, 0)

    dummyOrders.push({
      vendorId: vendor._id,
      customerName: `Customer ${i + 1}`,
      customerPhone: `99999${10000 + i}`,
      items,
      total,
      status: randomStatus(),
      createdAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000), // last 30 days
    })
  }

  // 4️⃣ Insert orders
  await Order.insertMany(dummyOrders)

  console.log("🎉 20 Dummy Orders Inserted Successfully!")
  process.exit(0)
}

seed()
