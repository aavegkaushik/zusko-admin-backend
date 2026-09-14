import express from "express";
import Order from "../Models/Order.js";
import auth from "../Middleware/auth.middleware.js";
import OrderScan from "../Models/OrderScan.js";
import {
  generateQrId,
  generateQrImage,
} from "../utils/qr.js";
import ProcessingSession from "../Models/ProcessingSession.js";
const router = express.Router();


// =====================================================
// POST /api/qr/orders/:id
// Generate QR for an order
//
// admin  -> any order
// vendor -> only their own order
// =====================================================

router.post("/orders/:id", auth, async (req, res) => {
  try {
    const { id } = req.params;

    // -----------------------------------------
    // Role check
    // -----------------------------------------

    if (!["admin", "vendor"].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "Admin or vendor access required",
      });
    }

    // -----------------------------------------
    // Find order
    // -----------------------------------------

    const order = await Order.findById(id).lean();

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // -----------------------------------------
    // Vendor can only access own orders
    // -----------------------------------------

    if (
      req.user.role === "vendor" &&
      String(order.vendorId) !== String(req.user.id)
    ) {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to access this order",
      });
    }

    // -----------------------------------------
    // Existing QR
    // -----------------------------------------

    if (order.qrId) {
      const qrImage = await generateQrImage(order.qrId);

      return res.json({
        success: true,
        message: "Existing QR returned",

        data: {
          orderId: order.orderId,
          qrId: order.qrId,
          qrImage,
          qrGeneratedAt: order.qrGeneratedAt,
        },
      });
    }

    // -----------------------------------------
    // Generate new QR ID
    // -----------------------------------------

    const qrId = generateQrId();

    const generatedAt = new Date();

    // -----------------------------------------
    // Save QR
    //
    // IMPORTANT:
    // Using findByIdAndUpdate instead of save()
    // because existing pre-save middleware uses
    // callback-style next().
    // -----------------------------------------

    const updatedOrder = await Order.findByIdAndUpdate(
      id,
      {
        $set: {
          qrId: qrId,
          qrGeneratedAt: generatedAt,
        },
      },
      {
        new: true,
        runValidators: true,
      }
    ).lean();

    if (!updatedOrder) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // -----------------------------------------
    // Generate QR image
    // -----------------------------------------

    const qrImage = await generateQrImage(qrId);

    // -----------------------------------------
    // Return response
    // -----------------------------------------

    return res.status(201).json({
      success: true,
      message: "QR generated successfully",

      data: {
        orderId: updatedOrder.orderId,
        qrId: updatedOrder.qrId,
        qrImage,
        qrGeneratedAt: updatedOrder.qrGeneratedAt,
      },
    });

  } catch (error) {
    console.error("Generate QR error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to generate QR",
      error: error.message,
    });
  }
});


// =====================================================
// GET /api/qr/resolve/:qrId
// Resolve QR -> Order
//
// admin  -> any order
// vendor -> only their own order
// =====================================================

router.get("/resolve/:qrId", auth, async (req, res) => {
  try {
    const { qrId } = req.params;

    // -----------------------------------------
    // Role check
    // -----------------------------------------

    if (!["admin", "vendor"].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "Admin or vendor access required",
      });
    }

    // -----------------------------------------
    // Validate QR ID
    // -----------------------------------------

    if (!qrId || !qrId.trim()) {
      return res.status(400).json({
        success: false,
        message: "QR ID is required",
      });
    }

    // -----------------------------------------
    // Find order using QR ID
    // -----------------------------------------

    const order = await Order.findOne({
      qrId: qrId.trim(),
    })
      .select(
        [
          "orderId",
          "qrId",
          "qrGeneratedAt",
          "qrExpiresAt",
          "vendorId",
          "customerName",
          "customerPhone",
          "customerId",
          "items",
          "total",
          "originalTotal",
          "discount",
          "deliveryFee",
          "handlingFee",
          "status",
          "pickup",
          "address",
          "createdAt",
          "updatedAt",
        ].join(" ")
      )
      .lean();

    // -----------------------------------------
    // QR not found
    // -----------------------------------------

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Invalid QR code or order not found",
      });
    }

    // -----------------------------------------
    // Vendor ownership check
    // -----------------------------------------

    if (
      req.user.role === "vendor" &&
      String(order.vendorId) !== String(req.user.id)
    ) {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to access this order",
      });
    }

    // -----------------------------------------
    // Optional QR expiry check
    // -----------------------------------------
    //
    // Currently qrExpiresAt is normally null.
    // Therefore this does NOT block normal QR use.
    //
    // Later, if we introduce QR expiry, this logic
    // will automatically protect expired QRs.
    // -----------------------------------------

    if (
      order.qrExpiresAt &&
      new Date(order.qrExpiresAt) < new Date()
    ) {
      return res.status(410).json({
        success: false,
        message: "This QR code has expired",
        data: {
          qrId: order.qrId,
          orderId: order.orderId,
          qrExpiresAt: order.qrExpiresAt,
        },
      });
    }

    // -----------------------------------------
    // Return resolved order
    // -----------------------------------------

    return res.json({
      success: true,
      message: "QR resolved successfully",

      data: {
        qrId: order.qrId,
        orderId: order.orderId,
        qrGeneratedAt: order.qrGeneratedAt,

        status: order.status,

        customer: {
          name: order.customerName,
          phone: order.customerPhone,
          customerId: order.customerId,
        },

        items: order.items,

        pricing: {
          total: order.total,
          originalTotal: order.originalTotal,
          discount: order.discount,
          deliveryFee: order.deliveryFee,
          handlingFee: order.handlingFee,
        },

        pickup: order.pickup,

        address: order.address,

        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
      },
    });

  } catch (error) {
    console.error("Resolve QR error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to resolve QR",
      error: error.message,
    });
  }
});


// =====================================================
// POST /api/qr/scan
// Record a QR scan
//
// admin  -> any order
// vendor -> only their own order
// =====================================================

router.post("/scan", auth, async (req, res) => {
  try {
    const {
      qrId,
      stage = "processing",
      result = "match",
      message = "",
      expectedOrderId = null,
      expectedOrderNumber = null,
    } = req.body;

    // -----------------------------------------
    // Role check
    // -----------------------------------------

    if (!["admin", "vendor"].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "Admin or vendor access required",
      });
    }

    // -----------------------------------------
    // Validate QR
    // -----------------------------------------

    if (!qrId || !qrId.trim()) {
      return res.status(400).json({
        success: false,
        message: "QR ID is required",
      });
    }

    // -----------------------------------------
    // Validate stage
    // -----------------------------------------

    const allowedStages = [
      "pickup",
      "accepted",
      "processing",
      "quality-check",
      "ready-for-delivery",
      "out-for-delivery",
      "completed",
    ];

    if (!allowedStages.includes(stage)) {
      return res.status(400).json({
        success: false,
        message: "Invalid scan stage",
      });
    }

    // -----------------------------------------
    // Validate result
    // -----------------------------------------

    const allowedResults = [
      "match",
      "mismatch",
      "invalid",
    ];

    if (!allowedResults.includes(result)) {
      return res.status(400).json({
        success: false,
        message: "Invalid scan result",
      });
    }

    // -----------------------------------------
    // Find order from QR
    // -----------------------------------------

    const order = await Order.findOne({
      qrId: qrId.trim(),
    }).lean();

    // -----------------------------------------
    // QR does not exist
    // -----------------------------------------

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Invalid QR code or order not found",
      });
    }

    // -----------------------------------------
    // Vendor ownership
    // -----------------------------------------

    if (
      req.user.role === "vendor" &&
      String(order.vendorId) !== String(req.user.id)
    ) {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to access this order",
      });
    }

    // -----------------------------------------
    // Save scan history
    // -----------------------------------------

    const scan = await OrderScan.create({
      orderId: order._id,
      orderNumber: order.orderId,

      qrId: order.qrId,

      stage,

      scannedBy: req.user.id,

      result,

      message,

      expectedOrderId:
        expectedOrderId || null,

      expectedOrderNumber:
        expectedOrderNumber || null,

      scannedAt: new Date(),
    });

    // -----------------------------------------
    // Response
    // -----------------------------------------

    return res.status(201).json({
      success: true,
      message: "QR scan recorded successfully",

      data: {
        scanId: scan._id,

        orderId: order.orderId,

        qrId: order.qrId,

        stage: scan.stage,

        result: scan.result,

        message: scan.message,

        scannedBy: scan.scannedBy,

        scannedAt: scan.scannedAt,
      },
    });

  } catch (error) {
    console.error("QR scan error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to record QR scan",
      error: error.message,
    });
  }
});


// =====================================================
// GET /api/qr/orders/:orderId/history
// Get scan history for an order
//
// admin  -> any order
// vendor -> only their own order
// =====================================================

router.get(
  "/orders/:orderId/history",
  auth,
  async (req, res) => {
    try {
      const { orderId } = req.params;

      // -----------------------------------------
      // Role check
      // -----------------------------------------

      if (!["admin", "vendor"].includes(req.user.role)) {
        return res.status(403).json({
          success: false,
          message: "Admin or vendor access required",
        });
      }

      // -----------------------------------------
      // Find order
      // -----------------------------------------

      const order = await Order.findById(orderId).lean();

      if (!order) {
        return res.status(404).json({
          success: false,
          message: "Order not found",
        });
      }

      // -----------------------------------------
      // Vendor ownership
      // -----------------------------------------

      if (
        req.user.role === "vendor" &&
        String(order.vendorId) !== String(req.user.id)
      ) {
        return res.status(403).json({
          success: false,
          message: "You are not allowed to access this order",
        });
      }

      // -----------------------------------------
      // Find scan history
      // -----------------------------------------

      const scans = await OrderScan.find({
        orderId: order._id,
      })
        .populate(
          "scannedBy",
          "name email role"
        )
        .sort({
          scannedAt: -1,
        })
        .lean();

      // -----------------------------------------
      // Response
      // -----------------------------------------

      return res.json({
        success: true,

        data: {
          orderId: order.orderId,

          qrId: order.qrId,

          totalScans: scans.length,

          scans,
        },
      });

    } catch (error) {
      console.error(
        "Get QR scan history error:",
        error
      );

      return res.status(500).json({
        success: false,
        message: "Failed to fetch scan history",
        error: error.message,
      });
    }
  }
);


// =====================================================
// POST /api/qr/processing/start
// Start processing session for an order
//
// admin  -> any order
// vendor -> only their own order
// =====================================================

router.post(
  "/processing/start",
  auth,
  async (req, res) => {
    try {
      const { orderId } = req.body || {};

      // -----------------------------------------
      // Role check
      // -----------------------------------------

      if (!["admin", "vendor"].includes(req.user.role)) {
        return res.status(403).json({
          success: false,
          message: "Admin or vendor access required",
        });
      }

      // -----------------------------------------
      // Validate order ID
      // -----------------------------------------

      if (!orderId) {
        return res.status(400).json({
          success: false,
          message: "Order ID is required",
        });
      }

      // -----------------------------------------
      // Find order
      // -----------------------------------------

      const order = await Order.findById(orderId).lean();

      if (!order) {
        return res.status(404).json({
          success: false,
          message: "Order not found",
        });
      }

      // -----------------------------------------
      // Vendor ownership
      // -----------------------------------------

      if (
        req.user.role === "vendor" &&
        String(order.vendorId) !== String(req.user.id)
      ) {
        return res.status(403).json({
          success: false,
          message: "You are not allowed to access this order",
        });
      }

      // -----------------------------------------
      // Order must have QR
      // -----------------------------------------

      if (!order.qrId) {
        return res.status(400).json({
          success: false,
          message: "QR code has not been generated for this order",
        });
      }

      // -----------------------------------------
      // Check existing active session
      // -----------------------------------------

      const existingSession =
        await ProcessingSession.findOne({
          orderId: order._id,
          status: "active",
        }).lean();

      if (existingSession) {
        return res.status(409).json({
          success: false,
          message: "Processing session is already active",
          data: {
            sessionId: existingSession._id,
            orderId: existingSession.orderNumber,
            status: existingSession.status,
            startedAt: existingSession.startedAt,
          },
        });
      }

      // -----------------------------------------
      // Create session
      // -----------------------------------------

      const session =
        await ProcessingSession.create({
          orderId: order._id,
          orderNumber: order.orderId,
          startedBy: req.user.id,
          status: "active",
          startedAt: new Date(),
        });

      // -----------------------------------------
      // Response
      // -----------------------------------------

      return res.status(201).json({
        success: true,
        message: "Processing session started",

        data: {
          sessionId: session._id,
          orderId: session.orderNumber,
          status: session.status,
          startedBy: session.startedBy,
          startedAt: session.startedAt,
        },
      });
    } catch (error) {
      console.error(
        "Start processing session error:",
        error
      );

      return res.status(500).json({
        success: false,
        message: "Failed to start processing session",
        error: error.message,
      });
    }
  }
);

// =====================================================
// POST /api/qr/processing/scan
// Scan QR inside an active processing session
//
// Backend automatically determines:
//
// MATCH
// or
// MISMATCH
//
// =====================================================

router.post(
  "/processing/scan",
  auth,
  async (req, res) => {
    try {
      const {
        sessionId,
        qrId,
      } = req.body || {};

      // -----------------------------------------
      // Role check
      // -----------------------------------------

      if (!["admin", "vendor"].includes(req.user.role)) {
        return res.status(403).json({
          success: false,
          message: "Admin or vendor access required",
        });
      }

      // -----------------------------------------
      // Validate input
      // -----------------------------------------

      if (!sessionId) {
        return res.status(400).json({
          success: false,
          message: "Session ID is required",
        });
      }

      if (!qrId || !qrId.trim()) {
        return res.status(400).json({
          success: false,
          message: "QR ID is required",
        });
      }

      // -----------------------------------------
      // Find active session
      // -----------------------------------------

      const session =
        await ProcessingSession.findOne({
          _id: sessionId,
          status: "active",
        }).lean();

      if (!session) {
        return res.status(404).json({
          success: false,
          message:
            "Active processing session not found",
        });
      }

      // -----------------------------------------
      // Find expected order
      // -----------------------------------------

      const expectedOrder =
        await Order.findById(
          session.orderId
        ).lean();

      if (!expectedOrder) {
        return res.status(404).json({
          success: false,
          message:
            "Expected order not found",
        });
      }

      // -----------------------------------------
      // Vendor ownership
      // -----------------------------------------

      if (
        req.user.role === "vendor" &&
        String(expectedOrder.vendorId) !==
          String(req.user.id)
      ) {
        return res.status(403).json({
          success: false,
          message:
            "You are not allowed to process this order",
        });
      }

      // -----------------------------------------
      // Find scanned QR
      // -----------------------------------------

      const scannedOrder =
        await Order.findOne({
          qrId: qrId.trim(),
        }).lean();

      // =========================================
      // INVALID QR
      // =========================================

      if (!scannedOrder) {
        const scan =
          await OrderScan.create({
            orderId: expectedOrder._id,

            orderNumber:
              expectedOrder.orderId,

            qrId: qrId.trim(),

            stage: "processing",

            scannedBy: req.user.id,

            result: "invalid",

            message:
              "Invalid QR code or order not found",

            expectedOrderId:
              expectedOrder._id,

            expectedOrderNumber:
              expectedOrder.orderId,

            scannedAt: new Date(),
          });

        return res.status(404).json({
          success: false,

          message:
            "Invalid QR code",

          data: {
            scanId: scan._id,

            result: "invalid",

            processingAllowed: false,

            expectedOrder:
              expectedOrder.orderId,

            scannedOrder: null,
          },
        });
      }

      // -----------------------------------------
      // Vendor ownership of scanned order
      // -----------------------------------------

      if (
        req.user.role === "vendor" &&
        String(scannedOrder.vendorId) !==
          String(req.user.id)
      ) {
        return res.status(403).json({
          success: false,
          message:
            "You are not allowed to access this QR",
        });
      }

      // =========================================
      // COMPARE ORDERS
      // =========================================

      const isMatch =
        String(scannedOrder._id) ===
        String(expectedOrder._id);

      // =========================================
      // MATCH
      // =========================================

      if (isMatch) {
        const scan =
          await OrderScan.create({
            orderId: scannedOrder._id,

            orderNumber:
              scannedOrder.orderId,

            qrId: scannedOrder.qrId,

            stage: "processing",

            scannedBy: req.user.id,

            result: "match",

            message:
              "Correct order scanned",

            expectedOrderId:
              expectedOrder._id,

            expectedOrderNumber:
              expectedOrder.orderId,

            scannedAt: new Date(),
          });

        return res.status(200).json({
          success: true,

          message:
            "Correct order scanned",

          data: {
            scanId: scan._id,

            result: "match",

            processingAllowed: true,

            expectedOrder:
              expectedOrder.orderId,

            scannedOrder:
              scannedOrder.orderId,

            qrId:
              scannedOrder.qrId,

            stage: "processing",

            scannedAt:
              scan.scannedAt,
          },
        });
      }

      // =========================================
      // MISMATCH
      // =========================================

      const scan =
        await OrderScan.create({
          orderId: scannedOrder._id,

          orderNumber:
            scannedOrder.orderId,

          qrId: scannedOrder.qrId,

          stage: "processing",

          scannedBy: req.user.id,

          result: "mismatch",

          message:
            `Wrong order scanned. Expected ${expectedOrder.orderId} but received ${scannedOrder.orderId}`,

          expectedOrderId:
            expectedOrder._id,

          expectedOrderNumber:
            expectedOrder.orderId,

          scannedAt: new Date(),
        });

      return res.status(409).json({
        success: false,

        message:
          "Wrong order scanned",

        data: {
          scanId: scan._id,

          result: "mismatch",

          processingAllowed: false,

          expectedOrder:
            expectedOrder.orderId,

          scannedOrder:
            scannedOrder.orderId,

          scannedQrId:
            scannedOrder.qrId,

          stage: "processing",

          scannedAt:
            scan.scannedAt,
        },
      });
    } catch (error) {
      console.error(
        "Processing QR scan error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to process QR scan",
        error: error.message,
      });
    }
  }
);


// =====================================================
// POST /api/qr/processing/complete
// Complete active processing session
// =====================================================

router.post(
  "/processing/complete",
  auth,
  async (req, res) => {
    try {
      const { sessionId } =
        req.body || {};

      // -----------------------------------------
      // Role check
      // -----------------------------------------

      if (!["admin", "vendor"].includes(req.user.role)) {
        return res.status(403).json({
          success: false,
          message:
            "Admin or vendor access required",
        });
      }

      // -----------------------------------------
      // Validate
      // -----------------------------------------

      if (!sessionId) {
        return res.status(400).json({
          success: false,
          message:
            "Session ID is required",
        });
      }

      // -----------------------------------------
      // Find session
      // -----------------------------------------

      const session =
        await ProcessingSession.findOne({
          _id: sessionId,
          status: "active",
        }).lean();

      if (!session) {
        return res.status(404).json({
          success: false,
          message:
            "Active processing session not found",
        });
      }

      // -----------------------------------------
      // Find order
      // -----------------------------------------

      const order =
        await Order.findById(
          session.orderId
        ).lean();

      if (!order) {
        return res.status(404).json({
          success: false,
          message:
            "Order not found",
        });
      }

      // -----------------------------------------
      // Vendor ownership
      // -----------------------------------------

      if (
        req.user.role === "vendor" &&
        String(order.vendorId) !==
          String(req.user.id)
      ) {
        return res.status(403).json({
          success: false,
          message:
            "You are not allowed to complete this session",
        });
      }

      // -----------------------------------------
      // Check mismatch scans
      // -----------------------------------------

      const mismatchCount =
        await OrderScan.countDocuments({
          expectedOrderId:
            session.orderId,

          result: {
            $in: [
              "mismatch",
              "invalid",
            ],
          },

          scannedAt: {
            $gte: session.startedAt,
          },
        });

      // -----------------------------------------
      // BLOCK completion if mismatch exists
      // -----------------------------------------

      if (mismatchCount > 0) {
        return res.status(409).json({
          success: false,

          message:
            "Processing cannot be completed because incorrect QR scans were detected",

          data: {
            processingAllowed: false,

            mismatchCount,

            sessionId:
              session._id,

            orderId:
              session.orderNumber,
          },
        });
      }

      // -----------------------------------------
      // Complete session
      // -----------------------------------------

      const completedSession =
        await ProcessingSession.findByIdAndUpdate(
          sessionId,

          {
            $set: {
              status: "completed",
              completedAt: new Date(),
            },
          },

          {
            new: true,
          }
        ).lean();

      // -----------------------------------------
      // Response
      // -----------------------------------------

      return res.json({
        success: true,

        message:
          "Processing session completed",

        data: {
          sessionId:
            completedSession._id,

          orderId:
            completedSession.orderNumber,

          status:
            completedSession.status,

          startedAt:
            completedSession.startedAt,

          completedAt:
            completedSession.completedAt,

          processingAllowed: true,
        },
      });
    } catch (error) {
      console.error(
        "Complete processing session error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to complete processing session",
        error: error.message,
      });
    }
  }
);


// =====================================================
// POST /api/qr/processing/stop
// Stop / cancel active processing session
// =====================================================

router.post(
  "/processing/stop",
  auth,
  async (req, res) => {
    try {
      const { sessionId } = req.body || {};

      // -----------------------------------------
      // Role check
      // -----------------------------------------

      if (!["admin", "vendor"].includes(req.user.role)) {
        return res.status(403).json({
          success: false,
          message: "Admin or vendor access required",
        });
      }

      // -----------------------------------------
      // Validate
      // -----------------------------------------

      if (!sessionId) {
        return res.status(400).json({
          success: false,
          message: "Session ID is required",
        });
      }

      // -----------------------------------------
      // Find active session
      // -----------------------------------------

      const session =
        await ProcessingSession.findOne({
          _id: sessionId,
          status: "active",
        }).lean();

      if (!session) {
        return res.status(404).json({
          success: false,
          message: "Active processing session not found",
        });
      }

      // -----------------------------------------
      // Find order
      // -----------------------------------------

      const order =
        await Order.findById(session.orderId).lean();

      if (!order) {
        return res.status(404).json({
          success: false,
          message: "Order not found",
        });
      }

      // -----------------------------------------
      // Vendor ownership
      // -----------------------------------------

      if (
        req.user.role === "vendor" &&
        String(order.vendorId) !== String(req.user.id)
      ) {
        return res.status(403).json({
          success: false,
          message: "You are not allowed to stop this session",
        });
      }

      // -----------------------------------------
      // Stop session
      // -----------------------------------------

      const stoppedSession =
        await ProcessingSession.findByIdAndUpdate(
          sessionId,
          {
            $set: {
              status: "cancelled",
              completedAt: new Date(),
            },
          },
          {
            new: true,
          }
        ).lean();

      return res.json({
        success: true,
        message: "Processing session stopped",
        data: {
          sessionId: stoppedSession._id,
          orderId: stoppedSession.orderNumber,
          status: stoppedSession.status,
        },
      });
    } catch (error) {
      console.error(
        "Stop processing session error:",
        error
      );

      return res.status(500).json({
        success: false,
        message: "Failed to stop processing session",
        error: error.message,
      });
    }
  }
);

export default router;