import dotenv from 'dotenv'
dotenv.config({ override: true })
import qrRoutes from "./Routes/qr.routes.js";
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import compression from 'compression'
import rateLimit from 'express-rate-limit'
import mongoose from 'mongoose'
import morgan from 'morgan'
import businessLeadRoutes from "./Routes/businessLead.routes.js";
// route imports
import authRoutes from './Routes/auth.js'
import auth from './Middleware/auth.middleware.js'
import ordersRoutes from './Routes/orders.js'
import analyticsRoutes from './Routes/analytics.js'
import vendorStats from './Routes/vendorStats.js'
import invoiceRoutes from "./Routes/invoice.js"
import settingsRoutes from './Routes/settings.js'
import vendorProfileRoutes from './Routes/vendor.profile.js'
import careerRoutes from "./Routes/career.routes.js";
import paymentRoutes from "./Routes/payment.js";
import businessQuoteRoutes from "./Routes/businessQuote.route.js";
import pricingRoutes from "./Routes/pricing.js";
import couponRoutes from "./Routes/coupon.routes.js";
import promotionRoutes from "./Routes/promotion.routes.js";
import deliveryPartnerRoutes from "./Routes/deliveryPartner.routes.js";
import { initSocket } from "./socket.js";
import { startOrderWatcher, stopOrderWatcher } from "./services/orderWatcher.js";
import { initRedis, closeRedisConnection } from "./config/redis.js";
import { metricsMiddleware, getPerformanceReport } from "./services/metrics.service.js";
// import paymentWebhookRoutes from "./Routes/payment.webhook.js";
// --- Config (from env) ---

dotenv.config();

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
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "https://zusko.in",
  "https://www.zusko.in",
  "https://admin.zusko.in",
  "https://business.zusko.in",
  "https://adminzusko.vercel.app"
];

app.use(
  cors({
    origin(origin, callback) {
      // Allow requests without an Origin (Postman, curl, server-to-server)
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
    ],
  })
);

// High-performance gzip response compression for payloads > 1KB
app.use(compression());

// Latency & performance tracking middleware
app.use(metricsMiddleware);

app.use(
  express.json({
    verify: (req, res, buf) => {
      if (
        req.originalUrl === "/api/payment/razorpay/webhook"
      ) {
        req.rawBody = Buffer.from(buf);
      }
    },
  })
);
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

// --- Performance Monitoring (Internal Admin Protected) ---
app.get("/api/performance", auth, async (req, res) => {
  try {
    const role = req.user?.role?.toLowerCase();
    if (!["admin", "superadmin"].includes(role)) {
      return res.status(403).json({ message: "Forbidden: Admin access required" });
    }
    const report = await getPerformanceReport();
    res.json({ ok: true, data: report });
  } catch (err) {
    res.status(500).json({ message: "Failed to generate performance report", error: err.message });
  }
});

// --- Mount API routes (implement these files next) ---
app.use('/api/auth', authRoutes)         // auth: register / login
app.use('/api/orders', ordersRoutes)     // orders CRUD + vendor scoping
app.use('/api/analytics', analyticsRoutes) // order aggregations
app.use("/api/vendors", vendorStats)
app.use("/api/vendor", vendorStats)      // alias for singular routes like /api/vendor/dashboard/bootstrap
app.use("/api", invoiceRoutes)
app.use("/api/qr", qrRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/vendors", vendorProfileRoutes);
app.use("/api/careers", careerRoutes)
app.use("/api/payment", paymentRoutes);
app.use("/api/pricing", pricingRoutes);
app.use("/api/coupons", couponRoutes);
app.use("/api/promotions", promotionRoutes);
app.use("/promotions", promotionRoutes);
app.use("/api/delivery-partners", deliveryPartnerRoutes);
app.use("/delivery-partners", deliveryPartnerRoutes);

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
      await mongoose.connect(process.env.MONGO_URI, {
        maxPoolSize: 50,
        minPoolSize: 10,
        socketTimeoutMS: 45000,
        serverSelectionTimeoutMS: 5000,
      })
      console.log("MongoDB connected with optimized connection pooling (maxPool: 50)")
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

  // Initialize centralized Redis in-memory cache
  initRedis();

  const server = app.listen(process.env.PORT, () => {
    console.log(`Server listening on port ${process.env.PORT}`);
  });

  // Initialize Socket.IO on the same HTTP server
  initSocket(server);

  console.log("🔌 Socket.IO initialized");

  // Start real-time order watcher (MongoDB Change Streams + resilient polling fallback)
  startOrderWatcher();

  // Graceful shutdown
  const shutdown = async (signal) => {
    console.log(`\nReceived ${signal}. Closing server...`)
    stopOrderWatcher();
    await closeRedisConnection();
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
