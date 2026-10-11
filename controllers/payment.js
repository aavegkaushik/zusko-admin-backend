import crypto from "crypto";
import Razorpay from "razorpay";
import Order from "../Models/Order.js";

/* =========================================================
   RAZORPAY INSTANCE
========================================================= */

const getRazorpay = () => {
  if (
    !process.env.RAZORPAY_KEY_ID ||
    !process.env.RAZORPAY_KEY_SECRET
  ) {
    throw new Error(
      "Razorpay credentials are missing in environment variables."
    );
  }

  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
};

/* =========================================================
   GENERATE PAYMENT QR

   POST /api/payment/generate-qr/:id

   This creates/reuses a Razorpay Dynamic UPI QR.
========================================================= */

export const generateQR = async (req, res) => {
  try {
    const razorpay = getRazorpay();

    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Order ID is required.",
      });
    }

    /* -------------------------------------------------------
       FIND ORDER
    ------------------------------------------------------- */

    const order = await Order.findById(id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found.",
      });
    }

    /* -------------------------------------------------------
       GET ORDER AMOUNT
    ------------------------------------------------------- */

    const amount = Number(order.total);

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid order amount.",
      });
    }

    /* -------------------------------------------------------
       PREVENT QR FOR ALREADY PAID ORDERS
    ------------------------------------------------------- */

    if (String(order.payment?.status).toLowerCase() === "paid") {
      return res.status(400).json({
        success: false,
        message: "This order has already been paid.",
      });
    }

    /* =======================================================
       CHECK EXISTING QR
    ======================================================= */

    if (order.qrId && order.qrExpiresAt) {
      const now = new Date();
      const expiresAt = new Date(order.qrExpiresAt);

      if (expiresAt > now) {
        try {
          const existingQR = await razorpay.qrCode.fetch(
            order.qrId
          );

          console.log(
            "========== EXISTING RAZORPAY QR =========="
          );
          console.log(JSON.stringify(existingQR, null, 2));
          console.log(
            "=========================================="
          );

          /*
           * IMPORTANT:
           *
           * image_url = Razorpay hosted QR image
           * short_url = Razorpay payment URL
           *
           * Frontend should display image_url directly.
           */

          const qrImage =
            existingQR?.image_url ||
            "";

          const qrLink =
            existingQR?.short_url ||
            order.qrLink ||
            "";

          /*
           * If Razorpay no longer gives us the QR image,
           * continue and create a fresh QR.
           */

          if (qrImage) {
            return res.status(200).json({
              success: true,
              message: "Existing Razorpay payment QR returned.",

              qrId:
                existingQR?.id ||
                order.qrId,

              qrImage,

              qrLink,

              amount,

              expiresAt:
                order.qrExpiresAt,
            });
          }
        } catch (qrFetchError) {
          console.error(
            "Existing Razorpay QR fetch failed:",
            qrFetchError?.error ||
              qrFetchError?.response?.data ||
              qrFetchError
          );

          /*
           * If old QR cannot be fetched,
           * create a new QR below.
           */
        }
      }
    }

    /* =======================================================
       QR EXPIRY
       
       15 MINUTES
    ======================================================= */

    const expiresAt = new Date(
      Date.now() + 15 * 60 * 1000
    );

    /*
     * Razorpay close_by expects Unix timestamp in seconds.
     */

    const closeBy = Math.floor(
      expiresAt.getTime() / 1000
    );

    /* =======================================================
       CREATE RAZORPAY DYNAMIC QR
    ======================================================= */

    const qr = await razorpay.qrCode.create({
      type: "upi_qr",

      name: `Zusko ${order.orderId || order._id}`,

      usage: "single_use",

      fixed_amount: true,

      /*
       * Razorpay amount is in paise.
       *
       * Example:
       * ₹499 -> 49900 paise
       */

      payment_amount: Math.round(amount * 100),

      description: `Zusko Order ${
        order.orderId || order._id
      }`,

      close_by: closeBy,

      notes: {
        internal_order_id: String(order._id),

        order_number: String(
          order.orderId || order._id
        ),
      },
    });

    console.log(
      "========== NEW RAZORPAY QR =========="
    );

    console.log(
      JSON.stringify(qr, null, 2)
    );

    console.log(
      "======================================"
    );

    /* =======================================================
       GET RAZORPAY QR URLs
    ======================================================= */

    /*
     * image_url:
     * Actual Razorpay QR image.
     *
     * short_url:
     * Razorpay payment URL.
     */

    const qrImage =
      qr?.image_url ||
      "";

    const qrLink =
      qr?.short_url ||
      "";

    /*
     * Very important:
     *
     * If Razorpay didn't return image_url,
     * don't pretend QR was generated.
     */

    if (!qrImage) {
      console.error(
        "Razorpay QR image_url is missing.",
        qr
      );

      return res.status(502).json({
        success: false,
        message:
          "Razorpay generated the QR, but QR image URL was not returned.",
      });
    }

    /* =======================================================
       UPDATE ORDER
       
       Do NOT use order.save()
       because Order.js has a pre-save total recalculation.
    ======================================================= */

    await Order.updateOne(
      {
        _id: order._id,
      },
      {
        $set: {
          qrId: qr.id,

          qrGeneratedAt: new Date(),

          qrLink,

          qrExpiresAt: expiresAt,

          "payment.status": "initiated",

          "payment.method": "upi",

          "payment.amount": amount,
        },
      }
    );

    /* =======================================================
       RESPONSE
    ======================================================= */

    return res.status(200).json({
      success: true,

      message:
        "Razorpay Dynamic Payment QR generated successfully.",

      qrId: qr.id,

      /*
       * ACTUAL QR IMAGE
       *
       * Frontend should show this inside <img>.
       */

      qrImage,

      /*
       * Payment URL.
       * Keep this for "Open Payment Link" button.
       */

      qrLink,

      amount,

      expiresAt,
    });
  } catch (error) {
    console.error(
      "Generate QR Error:",
      error?.error ||
        error?.response?.data ||
        error
    );

    return res.status(500).json({
      success: false,

      message:
        error?.error?.description ||
        error?.response?.data?.error?.description ||
        error?.message ||
        "Failed to generate payment QR.",
    });
  }
};

/* =========================================================
   GET PAYMENT STATUS

   GET /api/payment/status/:id
========================================================= */

export const getPaymentStatus = async (
  req,
  res
) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Order ID is required.",
      });
    }

    const order =
      await Order.findById(id).select(
        "_id orderId total payment paidAt qrId qrGeneratedAt qrLink qrExpiresAt"
      );

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found.",
      });
    }

    return res.status(200).json({
      success: true,

      orderId:
        order.orderId ||
        order._id,

      amount:
        Number(order.total),

      paymentStatus:
        order.payment?.status ||
        "pending",

      paymentMethod:
        order.payment?.method ||
        null,

      transactionId:
        order.payment?.transactionId ||
        null,

      paidAt:
        order.paidAt ||
        null,

      qrId:
        order.qrId ||
        null,

      qrLink:
        order.qrLink ||
        null,

      qrGeneratedAt:
        order.qrGeneratedAt ||
        null,

      qrExpiresAt:
        order.qrExpiresAt ||
        null,
    });
  } catch (error) {
    console.error(
      "Get Payment Status Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to fetch payment status.",
    });
  }
};

/* =========================================================
   RAZORPAY WEBHOOK

   POST /api/payment/razorpay/webhook
========================================================= */

export const razorpayWebhook = async (
  req,
  res
) => {
  try {
    const webhookSecret =
      process.env.RAZORPAY_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error(
        "RAZORPAY_WEBHOOK_SECRET is missing."
      );

      return res.status(500).json({
        success: false,
        message:
          "Webhook secret is not configured.",
      });
    }

    /* =======================================================
       RAW BODY
    ======================================================= */

    const rawBody = req.rawBody;

    if (!rawBody) {
      console.error(
        "Webhook rawBody is missing."
      );

      return res.status(400).json({
        success: false,
        message:
          "Razorpay webhook raw body is missing.",
      });
    }

    /* =======================================================
       SIGNATURE
    ======================================================= */

    const receivedSignature =
      req.headers[
        "x-razorpay-signature"
      ];

    if (!receivedSignature) {
      return res.status(400).json({
        success: false,
        message:
          "Razorpay webhook signature is missing.",
      });
    }

    const expectedSignature =
      crypto
        .createHmac(
          "sha256",
          webhookSecret
        )
        .update(rawBody)
        .digest("hex");

    const signaturesMatch =
      expectedSignature.length ===
        receivedSignature.length &&
      crypto.timingSafeEqual(
        Buffer.from(
          expectedSignature
        ),
        Buffer.from(
          receivedSignature
        )
      );

    if (!signaturesMatch) {
      console.error(
        "Invalid Razorpay webhook signature."
      );

      return res.status(400).json({
        success: false,
        message:
          "Invalid webhook signature.",
      });
    }

    /* =======================================================
       PARSE EVENT
    ======================================================= */

    const event =
      typeof req.body === "string"
        ? JSON.parse(req.body)
        : req.body;

    console.log(
      "========== RAZORPAY WEBHOOK =========="
    );

    console.log(
      "Event:",
      event?.event
    );

    console.log(
      "======================================"
    );

    /* =======================================================
       ONLY HANDLE PAYMENT CAPTURED
    ======================================================= */

    if (
      event?.event !==
      "payment.captured"
    ) {
      return res.status(200).json({
        success: true,
        message:
          "Webhook received.",
      });
    }

    const paymentEntity =
      event?.payload?.payment?.entity;

    if (!paymentEntity) {
      return res.status(400).json({
        success: false,
        message:
          "Payment entity missing.",
      });
    }

    const paymentId =
      paymentEntity.id;

    const capturedAmount =
      Number(
        paymentEntity.amount || 0
      ) / 100;

    /* =======================================================
       FIND ORDER
    ======================================================= */

    const internalOrderId =
      paymentEntity?.notes
        ?.internal_order_id;

    const orderNumber =
      paymentEntity?.notes
        ?.order_number;

    let order = null;

    /* -------------------------------------------------------
       1. INTERNAL MONGODB ORDER ID
    ------------------------------------------------------- */

    if (internalOrderId) {
      try {
        order =
          await Order.findById(
            internalOrderId
          );
      } catch (error) {
        console.error(
          "Invalid internal order ID:",
          error
        );
      }
    }

    /* -------------------------------------------------------
       2. ZUSKO ORDER NUMBER
    ------------------------------------------------------- */

    if (!order && orderNumber) {
      order =
        await Order.findOne({
          orderId:
            orderNumber,
        });
    }

    /* -------------------------------------------------------
       3. RAZORPAY QR ID
    ------------------------------------------------------- */

    if (
      !order &&
      paymentEntity?.qr_code_id
    ) {
      order =
        await Order.findOne({
          qrId:
            paymentEntity.qr_code_id,
        });
    }

    /* -------------------------------------------------------
       ORDER NOT FOUND
    ------------------------------------------------------- */

    if (!order) {
      console.error(
        "Order not found for Razorpay payment:",
        paymentId
      );

      /*
       * Return 200 so Razorpay does not
       * repeatedly retry the webhook.
       */

      return res.status(200).json({
        success: true,
        message:
          "Payment received but order not found.",
      });
    }

    /* =======================================================
       VERIFY PAYMENT AMOUNT
    ======================================================= */

    const orderAmount =
      Number(order.total);

    if (
      Math.abs(
        capturedAmount -
          orderAmount
      ) > 0.01
    ) {
      console.error(
        "Payment amount mismatch.",
        {
          orderId:
            order._id,

          expected:
            orderAmount,

          received:
            capturedAmount,

          paymentId,
        }
      );

      return res.status(400).json({
        success: false,
        message:
          "Payment amount mismatch.",
      });
    }

    /* =======================================================
       PREVENT DUPLICATE PROCESSING
    ======================================================= */

    if (
      String(
        order.payment?.status
      ).toLowerCase() ===
        "paid" &&
      order.payment
        ?.transactionId ===
        paymentId
    ) {
      return res.status(200).json({
        success: true,
        message:
          "Payment already processed.",
      });
    }

    /* =======================================================
       UPDATE PAYMENT

       Do NOT use order.save()
    ======================================================= */

    await Order.updateOne(
      {
        _id: order._id,
      },
      {
        $set: {
          "payment.status":
            "paid",

          "payment.method":
            "upi",

          "payment.transactionId":
            paymentId,

          "payment.amount":
            capturedAmount,

          paidAt:
            new Date(),
        },
      }
    );

    /* =======================================================
       LOG SUCCESS
    ======================================================= */

    console.log(
      "========== PAYMENT SUCCESS =========="
    );

    console.log(
      "Order:",
      order.orderId ||
        order._id
    );

    console.log(
      "Payment:",
      paymentId
    );

    console.log(
      "Amount:",
      capturedAmount
    );

    console.log(
      "====================================="
    );

    return res.status(200).json({
      success: true,

      message:
        "Payment captured successfully.",
    });
  } catch (error) {
    console.error(
      "Razorpay Webhook Error:",
      error?.error ||
        error?.response?.data ||
        error
    );

    return res.status(500).json({
      success: false,

      message:
        "Webhook processing failed.",
    });
  }
};