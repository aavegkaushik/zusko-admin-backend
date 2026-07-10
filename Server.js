import dotenv from 'dotenv'
dotenv.config({ override: true })

import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import mongoose from 'mongoose'
import morgan from 'morgan'
import businessLeadRoutes from "./Routes/businessLead.routes.js";
// route imports
import authRoutes from './Routes/auth.js'
import ordersRoutes from './Routes/orders.js'
import analyticsRoutes from './Routes/analytics.js'
import vendorStats from './Routes/vendorStats.js'
import invoiceRoutes from "./Routes/invoice.js"
import settingsRoutes from './Routes/settings.js'
import vendorProfileRoutes from './Routes/vendor.profile.js'
import careerRoutes from "./Routes/career.routes.js";
import paymentRoutes from "./Routes/payment.js";
import businessQuoteRoutes from "./Routes/businessQuote.route.js";
// import paymentWebhookRoutes from "./Routes/payment.webhook.js";
// --- Config (from env) ---

if (!process.env.MONGO_URI) {
  console.error('ERROR: MONGODB_URI is not set in environment')
  process.exit(1)
}

// --- Express app ---
const app = express()

// basic security + dev helpers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: [
          "'self'",
          "http://localhost:5173",
          "http://localhost:4000",
        ],
        frameSrc: [
          "'self'",
          "http://localhost:4000",
        ],
        frameAncestors: [
          "'self'",
          "http://localhost:5173",
        ],
      },
    },
  })
);
app.use(cors({ origin: true })) // adjust origin in production to specific domain
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))
if (process.env.NODE_ENV === 'development') app.use(morgan('dev'))

// rate limiter: basic protection for APIs
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 min
  max: 120, // limit each IP to 120 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
})
app.use('/api', apiLimiter)
app.use("/uploads", express.static("uploads"));

// --- Health check ---
app.get('/healthz', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() })
})

// --- Mount API routes (implement these files next) ---
app.use('/api/auth', authRoutes)         // auth: register / login
app.use('/api/orders', ordersRoutes)     // orders CRUD + vendor scoping
app.use('/api/analytics', analyticsRoutes) // order aggregations
app.use("/api/vendors", vendorStats)
app.use("/api", invoiceRoutes)
app.use("/api/settings", settingsRoutes);
app.use("/api/vendors", vendorProfileRoutes);
app.use("/api/careers", careerRoutes)
app.use("/api/payment", paymentRoutes);
app.use(
  "/api/business-leads",
  businessLeadRoutes
);
app.use(
   "/api/business-quotes",
   businessQuoteRoutes
);

// --- 404 handler ---
app.use((req, res, next) => {
  res.status(404).json({ message: 'Not Found' })
})

// --- Error handler ---
app.use((err, req, res, next) => {
  console.error(err) // consider better logging in production (pino/winston)
  const status = err.status || 500
  const payload = {
    message: err.message || 'Internal Server Error',
  }
  if (process.env.NODE_ENV === 'development') payload.stack = err.stack
  res.status(status).json(payload)
})

// --- MongoDB connection with retry/backoff ---
async function connectWithRetry(uri, retries = 5, delay = 2000) {
  for (let i = 0; i < retries; i++) {
    try {
      await mongoose.connect(process.env.MONGO_URI)
      console.log("MongoDB connected")
      return
    } catch (err) {
      console.error(`Mongo connection attempt ${i + 1} failed:`, err.message)
      if (i < retries - 1) {
        console.log(`Retrying in ${delay}ms...`)
        // exponential backoff
        await new Promise((r) => setTimeout(r, delay))
        delay *= 2
      } else {
        console.error('Could not connect to MongoDB. Exiting.')
        process.exit(1)
      }
    }
  }
}

// --- Start server after DB connected ---
async function start() {
  await connectWithRetry(process.env.MONGO_URI)
  const server = app.listen(process.env.PORT, () => {
    
    console.log(`Server listening on port ${process.env.PORT}`)
  })

  // Graceful shutdown
  const shutdown = async (signal) => {
    console.log(`\nReceived ${signal}. Closing server...`)
    server.close(async (err) => {
      if (err) {
        console.error('Error closing server', err)
        process.exit(1)
      }
      try {
        await mongoose.disconnect()
        console.log('MongoDB disconnected')
        process.exit(0)
      } catch (e) {
        console.error('Error during mongoose.disconnect', e)
        process.exit(1)
      }
    })
  }

  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}

start().catch((err) => {
  console.error('Failed to start server', err)
  process.exit(1)
})
