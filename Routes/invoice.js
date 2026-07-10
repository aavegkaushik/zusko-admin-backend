import express from "express";
import mongoose from "mongoose";
import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import dayjs from "dayjs";

import auth from "../middleware/auth.middleware.js";
import Order from "../models/Order.js";
import User from "../Models/Vendor.js";

const router = express.Router();

const PAGE = {
  width: 595.28,
  height: 841.89,
  margin: 40,
};

const COLORS = {
  primary: "#101828",
  secondary: "#475467",
  muted: "#667085",

  yellow: "#FFD700",
  yellowDark: "#F6C400",

  success: "#12B76A",
  warning: "#F79009",
  danger: "#F04438",

  white: "#FFFFFF",
  background: "#F9FAFB",
  border: "#EAECF0",
  card: "#FCFCFD",
};

const COMPANY = {
  name: "Zusko Laundry Services Pvt Ltd",
  email: "info@zusko.in",
  phone: "+91-XXXXXXXXXX",
  website: "www.zusko.in",
};

const LOGO_PATHS = [
  path.resolve(process.cwd(), "backend/public/image/fullLogo.png"),
  path.resolve(process.cwd(), "public/image/fullLogo.png"),
  path.resolve(process.cwd(), "fullLogo.png"),
];

const logoFile = LOGO_PATHS.find((p) => fs.existsSync(p)) || null;

const money=(v)=>

`Rs. ${Number(v||0).toFixed(2)}`;

const radius = 12;

function card(doc, x, y, w, h) {
  doc.roundedRect(x, y, w, h, radius).fillColor(COLORS.card).fill();

  doc
    .roundedRect(x, y, w, h, radius)
    .lineWidth(0.7)
    .strokeColor(COLORS.border)
    .stroke();
}

function heading(doc, text, x, y) {
  doc
    .font("Helvetica-Bold")
    .fontSize(8)
    .fillColor(COLORS.yellowDark)
    .text(text.toUpperCase(), x, y);
}

function value(doc, text, x, y, width = 180, bold = false) {
  doc
    .font(bold ? "Helvetica-Bold" : "Helvetica")
    .fontSize(10)
    .fillColor(COLORS.primary)
    .text(text || "-", x, y, {
      width,
    });
}

function divider(doc, y) {
  doc
    .moveTo(PAGE.margin, y)
    .lineTo(PAGE.width - PAGE.margin, y)
    .lineWidth(0.6)
    .strokeColor(COLORS.border)
    .stroke();
}

function paymentBadge(status = "pending") {
  switch (String(status).toLowerCase()) {
    case "paid":
      return {
        bg: "#D1FADF",
        text: "#027A48",
        label: "PAID",
      };

    case "failed":
      return {
        bg: "#FEE4E2",
        text: "#B42318",
        label: "FAILED",
      };

    case "refunded":
      return {
        bg: "#E0EAFF",
        text: "#175CD3",
        label: "REFUNDED",
      };

    default:
      return {
        bg: "#FEF3C7",
        text: "#B54708",
        label: "PENDING",
      };
  }
}

function invoiceNumber(order) {
  return order.orderId || `INV-${String(order._id).slice(-6)}`;
}

function drawCard(doc, x, y, w, h) {
  card(doc, x, y, w, h);
}

// ======================================================================
// HEADER
// ======================================================================

function drawHeader(doc, order) {
  doc.rect(0, 0, PAGE.width, 8).fill(COLORS.yellow);

  if (logoFile) {
    doc.image(logoFile, PAGE.margin, 22, {
      width: 150,
    });
  }

  doc
    .font("Helvetica-Bold")
    .fontSize(30)
    .fillColor(COLORS.primary)
    .text("INVOICE", 0, 30, {
      align: "right",
    });

  doc.font("Helvetica").fontSize(9).fillColor(COLORS.secondary);

  doc.text(`Order ID : ${order.orderId || order._id}`, 0, 82, {
    align: "right",
  });

  doc.text(dayjs(order.createdAt).format("DD MMM YYYY hh:mm A"), 0, 96, {
    align: "right",
  });

  const badge = paymentBadge(order.payment?.status);

  const bx = PAGE.width - PAGE.margin - 90;

  const by = 118;

  doc.roundedRect(bx, by, 90, 30, 15).fillColor(badge.bg).fill();

  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor(badge.text)
    .text(badge.label, bx, by + 10, {
      width: 90,
      align: "center",
    });

  divider(doc, 165);

  return 182;
}

// ======================================================================
// CUSTOMER CARD
// ======================================================================

function drawCustomerCard(doc, order, x, y, w) {
  card(doc, x, y, w, 125);

  heading(doc, "Customer", x + 16, y + 14);

  value(doc, order.customerName, x + 16, y + 34, w - 30, true);

  value(doc, order.customerPhone, x + 16, y + 54, w - 30);

  value(doc, order.customerEmail, x + 16, y + 72, w - 30);

  value(doc, order.address?.fullAddress, x + 16, y + 92, w - 30);
}

// ======================================================================
// COMPANY CARD
// ======================================================================

function drawCompanyCard(doc, x, y, w) {
  card(doc, x, y, w, 125);

  heading(doc, "Company", x + 16, y + 14);

  value(doc, COMPANY.name, x + 16, y + 34, w - 30, true);

  value(doc, COMPANY.email, x + 16, y + 54);

  value(doc, COMPANY.phone, x + 16, y + 72);

  value(doc, COMPANY.website, x + 16, y + 90);

  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor(COLORS.secondary)
    .text(COMPANY.gst, x + 16, y + 108);
}

// ======================================================================
// ORDER INFO CARD
// ======================================================================


// ======================================================================
// ITEMS TABLE
// ======================================================================

function drawItemsTable(doc, items, y) {
  const startX = PAGE.margin;
  const width = PAGE.width - PAGE.margin * 2;

  // Header
  doc.roundedRect(startX, y, width, 34, 12).fillColor(COLORS.primary).fill();

  doc.font("Helvetica-Bold").fontSize(10).fillColor("white");

  doc.text("SERVICE", startX + 18, y + 11);
  doc.text("QTY", startX + 285, y + 11);
  doc.text("PRICE", startX + 360, y + 11);
  doc.text("AMOUNT", startX + 450, y + 11);

  y += 40;

  let subtotal = 0;

  items.forEach((item, index) => {
    const qty = Number(item.qty || 0);
    const price = Number(item.price || 0);
    const total = qty * price;

    subtotal += total;

    // Zebra Row
    if (index % 2 === 0) {
      doc
        .roundedRect(startX, y - 3, width, 26, 8)
        .fillColor("#FAFAFA")
        .fill();
    }

    // Service Name
    doc
      .font("Helvetica-Bold")
      .fontSize(10)
      .fillColor(COLORS.primary)
      .text(item.name || "Laundry Service", startX + 18, y + 4, {
        width: 230,
      });

    // Qty Badge
    doc
      .roundedRect(startX + 285, y + 2, 28, 18, 8)
      .fillColor(COLORS.yellow)
      .fill();

    doc
      .font("Helvetica-Bold")
      .fontSize(9)
      .fillColor(COLORS.primary)
      .text(qty, startX + 285, y + 7, {
        width: 28,
        align: "center",
      });

    // Price
    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor(COLORS.secondary)
      .text(money(price), startX + 350, y + 4, {
        width: 70,
        align: "right",
      });

    // Amount
    doc
      .font("Helvetica-Bold")
      .fontSize(10)
      .fillColor(COLORS.primary)
      .text(money(total), startX + 445, y + 4, {
        width: 70,
        align: "right",
      });

    y += 28;
  });

  divider(doc, y + 2);

  return {
    y: y + 15,
    subtotal,
  };
}

// ======================================================================
// PRICE SUMMARY + PAYMENT + QR
// ======================================================================

async function drawSummarySection(doc, order, y) {
  const leftWidth = 300;
  const rightWidth = 175;

  // ===========================
  // SUMMARY CARD
  // ===========================

  card(doc, PAGE.margin, y, leftWidth, 185);

  heading(doc, "Price Summary", PAGE.margin + 16, y + 16);

  const rows = [
    ["Subtotal", money(order.subtotal)],
    ["Discount", `- ${money(order.discount || 0)}`],
    ["Delivery Fee", money(order.deliveryFee || 0)],
    ["Handling Fee", money(order.handlingFee || 0)],
    ["GST", "INR 0.00"],
  ];

  let yy = y + 45;

  rows.forEach(([labelText, valueText]) => {
    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor(COLORS.secondary)
      .text(labelText, PAGE.margin + 16, yy);

    doc
      .font("Helvetica-Bold")
      .fillColor(COLORS.primary)
      .text(valueText, PAGE.margin + 120, yy, {
        width: 150,
        align: "right",
      });

    yy += 22;
  });

  divider(doc, yy + 3);

  yy += 15;

  doc
    .roundedRect(PAGE.margin + 12, yy, leftWidth - 24, 42, 12)
    .fillColor(COLORS.yellow)
    .fill();

  doc
    .font("Helvetica-Bold")
    .fontSize(12)
    .fillColor(COLORS.primary)
    .text("Grand Total", PAGE.margin + 24, yy + 14);

  doc.text(money(order.total), PAGE.margin + 120, yy + 14, {
    width: 150,
    align: "right",
  });

  // ===========================
  // QR CARD
  // ===========================

  const qr = await QRCode.toBuffer(
    `https://zusko.in/track-order/${order._id}`,
    {
      width: 220,
      margin: 1,
    },
  );

  const rightX = PAGE.margin + leftWidth + 20;

  card(doc, rightX, y, rightWidth, 185);

  doc.image(qr, rightX + 28, y + 18, {
    width: 120,
  });

  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor(COLORS.primary)
    .text("Scan to Track Order", rightX, y + 145, {
      width: rightWidth,
      align: "center",
    });

  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor(COLORS.secondary)
    .text(order._id.toString(), rightX + 12, y + 163, {
      width: rightWidth - 24,
      align: "center",
    });

  return y + 205;
}

// ======================================================================
// PAYMENT STATUS CARD
// ======================================================================

function drawPaymentCard(doc, order, y) {
  card(doc, PAGE.margin, y, PAGE.width - PAGE.margin * 2, 75);

  const badge = paymentBadge(order.payment?.status);

  doc
    .roundedRect(PAGE.margin + 18, y + 20, 90, 34, 17)
    .fillColor(badge.bg)
    .fill();

  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor(badge.text)
    .text(badge.label, PAGE.margin + 18, y + 30, {
      width: 90,
      align: "center",
    });

  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor(COLORS.primary)
    .text(`Payment Method : ${order.payment?.method || "-"}`, 160, y + 18);

  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(COLORS.secondary)
    .text(
      `Transaction ID : ${order.payment?.transactionId || "-"}`,
      160,
      y + 38,
    );

  if (order.payment?.paidAt) {
    doc.text(
      `Paid On : ${dayjs(order.payment.paidAt).format("DD MMM YYYY hh:mm A")}`,
      360,
      y + 18,
      {
        width: 180,
      },
    );
  }

  return y + 95;
}

// ======================================================================
// FOOTER
// ======================================================================

function drawFooter(doc) {
  const y = PAGE.height - 65;

  doc.rect(0, y, PAGE.width, 65).fill(COLORS.primary);

  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor(COLORS.yellow)
    .text("Need Help?", PAGE.margin, y + 10);

  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor("white")
    .text(
      `${COMPANY.email}   |   ${COMPANY.phone}   |   ${COMPANY.website}`,
      PAGE.margin,
      y + 28,
    );

  // doc
  //   .font("Helvetica")
  //   .fontSize(8)
  //   .fillColor("#FFFFFFAA")
  //   .text("Thank you for choosing Zusko ❤️", PAGE.margin, y + 46, {
  //     width: PAGE.width - PAGE.margin * 2,
  //     align: "center",
  //   });
}

router.get("/orders/:id/invoice", auth, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).lean();

    if (!order) {
      return res.status(404).json({
        message: "Order not found",
      });
    }

    const vendor = await User.findById(order.vendorId).lean();

    const doc = new PDFDocument({
      size: "A4",

      margin: PAGE.margin,
    });

    res.setHeader("Content-Type", "application/pdf");

    res.setHeader(
      "Content-Disposition",

      `attachment; filename=${invoiceNumber(order)}.pdf`,
    );

    doc.pipe(res);

    let y = drawHeader(doc, order);

    const half = (PAGE.width - PAGE.margin * 2 - 15) / 2;

    drawCustomerCard(
      doc,

      order,

      PAGE.margin,

      y,

      half,
    );

    drawCompanyCard(
      doc,

      PAGE.margin + half + 15,

      y,

      half,
    );

    y += 145;

    // y = drawOrderInfo(
    //   doc,

    //   order,

    //   y,
    // );

    const table = drawItemsTable(
      doc,

      order.items,

      y,
    );

    y = table.y;

    y = await drawSummarySection(
      doc,

      {
        ...order,

        subtotal: table.subtotal,
      },

      y,
    );

    y = drawPaymentCard(
      doc,

      order,

      y,
    );

    drawFooter(doc);

    doc.end();
  } catch (err) {
    console.error(err);

    if (!res.headersSent) {
      res.status(500).json({
        message: err.message,
      });
    }
  }
});

export default router