import crypto from "crypto";
import Order from "../Models/Order.js";

// const razorpay = new Razorpay({
//   key_id: process.env.RAZORPAY_KEY_ID,
//   key_secret: process.env.RAZORPAY_KEY_SECRET,
// });

// // =========================
// // Generate Dynamic QR
// // =========================
// export const generateQR = async (req, res) => {
//   try {
//     const { id } = req.params;

//     const order = await Order.findById(id);

//     if (!order) {
//       return res.status(404).json({
//         success: false,
//         message: "Order not found",
//       });
//     }

//     if (order.payment.status === "paid") {
//       return res.status(400).json({
//         success: false,
//         message: "Order already paid",
//       });
//     }

//     // Already Generated
//     if (
//       order.payment.qrImage &&
//       order.payment.qrExpiresAt &&
//       new Date(order.payment.qrExpiresAt) > new Date()
//     ) {
//       return res.json({
//         success: true,
//         qrImage: order.payment.qrImage,
//         qrLink: order.payment.qrLink,
//         expiresAt: order.payment.qrExpiresAt,
//       });
//     }

//     const qr = await razorpay.qrCode.create({
//       type: "upi_qr",
//       usage: "single_use",
//       fixed_amount: true,
//       payment_amount: Math.round(order.total * 100),
//       description: `Zusko Order ${order._id}`,
//       close_by: Math.floor(Date.now() / 1000) + 1800, // 30 min
//     });

//     order.payment.qrId = qr.id;
//     order.payment.qrImage = qr.image_url;
//     order.payment.qrLink = qr.short_url;
//     order.payment.qrGeneratedAt = new Date();
//     order.payment.qrExpiresAt = new Date(Date.now() + 30 * 60 * 1000);

//     await order.save();

//     return res.json({
//       success: true,
//       message: "QR Generated",
//       qrImage: qr.image_url,
//       qrLink: qr.short_url,
//       expiresAt: order.payment.qrExpiresAt,
//     });
//   } catch (err) {
//     console.error(err);

//     return res.status(500).json({
//       success: false,
//       message: err.message,
//     });
//   }
// };

// =========================
// Get Payment Status
// =========================
export const getPaymentStatus = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    res.json({
      success: true,
      payment: order.payment,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// =========================
// Razorpay Webhook
// =========================
export const razorpayWebhook = async (req, res) => {
  try {
    const signature = req.headers["x-razorpay-signature"];

    const expectedSignature = crypto
      .createHmac(
        "sha256",
        // process.env.RAZORPAY_WEBHOOK_SECRET
      )
      .update(req.body)
      .digest("hex");

    if (signature !== expectedSignature) {
      return res.status(400).json({
        success: false,
        message: "Invalid Signature",
      });
    }

    const payload = JSON.parse(req.body.toString());

    if (payload.event === "payment.captured") {

      const payment = payload.payload.payment.entity;

      // QR Payment Find
      const order = await Order.findOne({
        "payment.qrId": payment.acquirer_data?.qr_code_id,
      });

      if (order) {

        order.payment.status = "paid";
        order.payment.method = "UPI";
        order.payment.transactionId = payment.id;
        order.payment.paidAt = new Date();

        // Remove QR
        order.payment.qrId = "";
        order.payment.qrImage = "";
        order.payment.qrLink = "";
        order.payment.qrGeneratedAt = null;
        order.payment.qrExpiresAt = null;

        await order.save();

        console.log(
          "Payment received for order",
          order._id
        );
      }
    }

    return res.json({
      success: true,
    });

  } catch (err) {

    console.error(err);

    return res.status(500).json({
      success: false,
      message: err.message,
    });

  }
};