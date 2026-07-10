import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

/* ------------------------------------------------------------------ */
/* Design tokens - keep every color/spacing decision here so the PDF   */
/* has one visual identity across the whole document.                 */
/* ------------------------------------------------------------------ */

const COLORS = {
  ink: "#0B1220", // primary text / headings
  slate: "#475569", // secondary text
  muted: "#94A3B8", // captions / footer text
  accent: "#0F766E", // Zusko teal - brand accent
  accentSoft: "#E6F4F2", // pale teal for table header / highlight fills
  border: "#E2E8F0",
  rowAlt: "#F8FAFC",
  danger: "#DC2626",
};

const FONT = {
  regular: "Helvetica",
  bold: "Helvetica-Bold",
};

const PAGE = { width: 595.28, height: 841.89, margin: 50 }; // A4 in points
const CONTENT_WIDTH = PAGE.width - PAGE.margin * 2;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOGO_PATH = path.join(__dirname, "../assets/logo.png");
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || "info@zusko.in";
const SUPPORT_PHONE = process.env.SUPPORT_PHONE || "+91 8004411976";
const CLIENT_URL =
  process.env.CLIENT_URL || "http://localhost:5174" || "https://zusko.in";

/* ------------------------------------------------------------------ */
/* Small drawing helpers                                              */
/* ------------------------------------------------------------------ */

function money(value) {
  const n = Number(value || 0);
  return `Rs. ${n.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(date) {
  if (!date) return "-";
  return new Date(date).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** Ensures there is room left on the page; adds a new page + repeats the
 *  running header band if not, so long quotes paginate cleanly. */
function ensureSpace(doc, requiredHeight, currentY) {
  const bottomLimit = PAGE.height - PAGE.margin - 60; // leave room for footer
  if (currentY + requiredHeight > bottomLimit) {
    doc.addPage();
    drawRunningHeader(doc);
    return PAGE.margin + 40;
  }
  return currentY;
}

function drawRunningHeader(doc) {
  doc
    .rect(0, 0, PAGE.width, 6)
    .fill(COLORS.accent);
}

function drawFooter(doc, pageNumber) {
  const y = PAGE.height - PAGE.margin + 10;
  doc
    .moveTo(PAGE.margin, y)
    .lineTo(PAGE.width - PAGE.margin, y)
    .lineWidth(0.5)
    .strokeColor(COLORS.border)
    .stroke();

  doc
    .font(FONT.regular)
    .fontSize(8)
    .fillColor(COLORS.muted)
    .text(
      `Zusko Laundry Services  |  ${SUPPORT_EMAIL}  |  ${SUPPORT_PHONE}`,
      PAGE.margin,
      y + 10,
      { width: CONTENT_WIDTH / 2 }
    );

  doc.text(`Page ${pageNumber}`, PAGE.margin, y + 10, {
    width: CONTENT_WIDTH,
    align: "right",
  });
}

/* ------------------------------------------------------------------ */
/* Main export                                                        */
/* ------------------------------------------------------------------ */

function renderDocument(doc, quote, lead) {
  let y = PAGE.margin + 30;

  /* ---------------- Header: Logo + Company / Quote meta card ------- */
  const headerTop = y;

  if (fs.existsSync(LOGO_PATH)) {
    doc.image(LOGO_PATH, PAGE.margin, headerTop, { width: 110 });
  } else {
    doc
      .font(FONT.bold)
      .fontSize(22)
      .fillColor(COLORS.ink)
      .text("ZUSKO", PAGE.margin, headerTop);
    doc
      .font(FONT.regular)
      .fontSize(9)
      .fillColor(COLORS.accent)
      .text("PROFESSIONAL LAUNDRY SERVICES", PAGE.margin, headerTop + 26);
  }

  // Quote meta card (top-right)
  const cardWidth = 210;
  const cardX = PAGE.width - PAGE.margin - cardWidth;
  doc
    .roundedRect(cardX, headerTop - 5, cardWidth, 80, 8)
    .fillAndStroke(COLORS.accentSoft, COLORS.border);

  doc
    .font(FONT.bold)
    .fontSize(13)
    .fillColor(COLORS.accent)
    .text(quote.quoteNumber, cardX + 14, headerTop + 8, {
      width: cardWidth - 28,
    });

  doc
    .font(FONT.regular)
    .fontSize(9)
    .fillColor(COLORS.slate)
    .text(`Date: ${formatDate(quote.createdAt || Date.now())}`, cardX + 14, headerTop + 30)
    .text(`Valid Till: ${formatDate(quote.validTill)}`, cardX + 14, headerTop + 46)
    .text(`Status: ${quote.status}`, cardX + 14, headerTop + 62);

  y = headerTop + 100;

  doc
    .moveTo(PAGE.margin, y)
    .lineTo(PAGE.width - PAGE.margin, y)
    .lineWidth(1)
    .strokeColor(COLORS.border)
    .stroke();

  y += 24;

  /* ---------------- Prepared For / Prepared By ---------------------- */
  const colWidth = CONTENT_WIDTH / 2 - 12;

  doc.font(FONT.bold).fontSize(10).fillColor(COLORS.accent);
  doc.text("PREPARED FOR", PAGE.margin, y);
  doc.text("PREPARED BY", PAGE.margin + colWidth + 24, y);

  doc.font(FONT.bold).fontSize(11).fillColor(COLORS.ink);
  doc.text(lead.businessName || "-", PAGE.margin, y + 16, { width: colWidth });
  doc.text("Zusko Laundry Services Pvt. Ltd.", PAGE.margin + colWidth + 24, y + 16, {
    width: colWidth,
  });

  doc.font(FONT.regular).fontSize(9).fillColor(COLORS.slate);
  const leadLines = [
    lead.ownerName,
    lead.address,
    lead.city,
    lead.phone,
    lead.email,
  ]
    .filter(Boolean)
    .join("\n");
  doc.text(leadLines, PAGE.margin, y + 34, { width: colWidth, lineGap: 3 });

  const usLines = [
    "Corporate Office, Sector 63",
    "Noida, Uttar Pradesh, India",
    SUPPORT_PHONE,
    SUPPORT_EMAIL,
  ].join("\n");
  doc.text(usLines, PAGE.margin + colWidth + 24, y + 34, {
    width: colWidth,
    lineGap: 3,
  });

  y += 34 + 70;

  /* ---------------- Service Line Item Table -------------------------- */
  y = ensureSpace(doc, 40, y);

  const cols = [
    { key: "serviceName", label: "Service", width: 0.34 },
    { key: "quantity", label: "Qty", width: 0.12, align: "center" },
    { key: "unit", label: "Unit", width: 0.14, align: "center" },
    { key: "price", label: "Rate", width: 0.16, align: "right" },
    { key: "subtotal", label: "Subtotal", width: 0.24, align: "right" },
  ].map((c) => ({ ...c, px: c.width * CONTENT_WIDTH }));

  function colX(index) {
    let x = PAGE.margin;
    for (let i = 0; i < index; i++) x += cols[i].px;
    return x;
  }

  function drawTableHeader(rowY) {
    doc.rect(PAGE.margin, rowY, CONTENT_WIDTH, 26).fill(COLORS.ink);
    doc.font(FONT.bold).fontSize(9).fillColor("#FFFFFF");
    cols.forEach((c, i) => {
      doc.text(c.label.toUpperCase(), colX(i) + 8, rowY + 8, {
        width: c.px - 16,
        align: c.align || "left",
      });
    });
    return rowY + 26;
  }

  y = drawTableHeader(y);

  quote.services.forEach((item, idx) => {
    const rowHeight = 26;
    y = ensureSpace(doc, rowHeight + 4, y);
    // if we paginated, ensureSpace already redrew running header;
    // repeat the table header on the fresh page for readability
    if (y === PAGE.margin + 40) {
      y = drawTableHeader(y);
    }

    if (idx % 2 === 1) {
      doc.rect(PAGE.margin, y, CONTENT_WIDTH, rowHeight).fill(COLORS.rowAlt);
    }

    doc.font(FONT.regular).fontSize(9.5).fillColor(COLORS.ink);
    doc.text(item.serviceName, colX(0) + 8, y + 8, { width: cols[0].px - 16 });
    doc.text(String(item.quantity), colX(1) + 8, y + 8, {
      width: cols[1].px - 16,
      align: "center",
    });
    doc.text(item.unit, colX(2) + 8, y + 8, {
      width: cols[2].px - 16,
      align: "center",
    });
    doc.text(money(item.price), colX(3) + 8, y + 8, {
      width: cols[3].px - 16,
      align: "right",
    });
    doc.font(FONT.bold).text(money(item.subtotal), colX(4) + 8, y + 8, {
      width: cols[4].px - 16,
      align: "right",
    });

    y += rowHeight;
  });

  doc
    .moveTo(PAGE.margin, y)
    .lineTo(PAGE.width - PAGE.margin, y)
    .lineWidth(1)
    .strokeColor(COLORS.border)
    .stroke();

  y += 16;

  /* ---------------- Totals block (right aligned) --------------------- */
  y = ensureSpace(doc, 160, y);
  const totalsWidth = 240;
  const totalsX = PAGE.width - PAGE.margin - totalsWidth;

  function totalRow(label, value, opts = {}) {
    doc
      .font(opts.bold ? FONT.bold : FONT.regular)
      .fontSize(opts.bold ? 11 : 9.5)
      .fillColor(opts.color || COLORS.slate);
    doc.text(label, totalsX, y, { width: totalsWidth * 0.55 });
    doc.text(value, totalsX + totalsWidth * 0.55, y, {
      width: totalsWidth * 0.45,
      align: "right",
    });
    y += opts.bold ? 22 : 18;
  }

  totalRow("Subtotal", money(quote.subtotal));

  if (quote.discount?.amount > 0) {
    const label =
      quote.discount.type === "percentage"
        ? `Discount (${quote.discount.value}%)`
        : "Discount";
    totalRow(label, `- ${money(quote.discount.amount)}`, {
      color: COLORS.danger,
    });
  }

  if (quote.pickupCharge > 0) {
    totalRow("Pickup Charge", money(quote.pickupCharge));
  }

  (quote.additionalCharges || []).forEach((charge) => {
    totalRow(charge.label, money(charge.amount));
  });

  if (quote.gst?.amount > 0) {
    totalRow(`GST (${quote.gst.percentage}%)`, money(quote.gst.amount));
  }

  y += 4;
  doc
    .roundedRect(totalsX - 12, y - 4, totalsWidth + 12, 34, 6)
    .fill(COLORS.accentSoft);
  doc.fillColor(COLORS.accent);
  totalRow("GRAND TOTAL", money(quote.grandTotal), { bold: true, color: COLORS.accent });

  y += 30;

  /* ---------------- Notes ------------------------------------------- */
  if (quote.notes) {
    y = ensureSpace(doc, 60, y);
    doc.font(FONT.bold).fontSize(10).fillColor(COLORS.accent).text("NOTES", PAGE.margin, y);
    y += 16;
    doc
      .font(FONT.regular)
      .fontSize(9)
      .fillColor(COLORS.slate)
      .text(quote.notes, PAGE.margin, y, { width: CONTENT_WIDTH, lineGap: 3 });
    y += doc.heightOfString(quote.notes, { width: CONTENT_WIDTH, lineGap: 3 }) + 16;
  }

  /* ---------------- Payment / Turnaround summary strip --------------- */
  y = ensureSpace(doc, 50, y);
  const stripItems = [
    ["Payment Terms", quote.paymentTerms],
    ["Turnaround Time", quote.turnaroundTime],
    ["Pickup Frequency", quote.pickupFrequency || "-"],
  ];
  const stripColWidth = CONTENT_WIDTH / 3;
  stripItems.forEach(([label, value], i) => {
    const x = PAGE.margin + i * stripColWidth;
    doc.font(FONT.bold).fontSize(8).fillColor(COLORS.muted).text(label.toUpperCase(), x, y);
    doc.font(FONT.regular).fontSize(9.5).fillColor(COLORS.ink).text(value || "-", x, y + 12, {
      width: stripColWidth - 10,
    });
  });
  y += 50;

  /* ---------------- Terms & Conditions -------------------------------- */
  y = ensureSpace(doc, 80, y);
  doc.font(FONT.bold).fontSize(10).fillColor(COLORS.accent).text("TERMS & CONDITIONS", PAGE.margin, y);
  y += 16;
  doc
    .font(FONT.regular)
    .fontSize(8.5)
    .fillColor(COLORS.slate)
    .text(quote.terms, PAGE.margin, y, { width: CONTENT_WIDTH, lineGap: 3 });
  y += doc.heightOfString(quote.terms, { width: CONTENT_WIDTH, lineGap: 3 }) + 30;

  /* ---------------- Signature + QR code block -------------------------- */
  y = ensureSpace(doc, 110, y);

  // Signature line (left)
  doc
    .moveTo(PAGE.margin, y + 50)
    .lineTo(PAGE.margin + 200, y + 50)
    .lineWidth(1)
    .strokeColor(COLORS.border)
    .stroke();
  doc
    .font(FONT.regular)
    .fontSize(9)
    .fillColor(COLORS.slate)
    .text("Authorized Signatory - Zusko Laundry Services", PAGE.margin, y + 56);

  // QR code (right) - links to the online accept/reject page.
  // The actual QR PNG is generated asynchronously (see generateQuotePDF)
  // and injected into this reserved slot once the layout pass is done.
  const qrLink = `${CLIENT_URL}/quotes/${quote._id}/respond`;
  doc._quoteQrSlot = { x: PAGE.width - PAGE.margin - 90, y, size: 80, link: qrLink };

  doc
    .font(FONT.regular)
    .fontSize(7.5)
    .fillColor(COLORS.muted)
    .text("Scan to view & respond online", doc._quoteQrSlot.x - 15, y + 84, {
      width: 110,
      align: "center",
    });
}

/**
 * Public entry point. Wraps buildQuotePDF so the QR code (which requires
 * an async PNG buffer) is generated first and injected into the layout.
 */
async function generateQuotePDF(quote, lead) {
  const qrLink = `${CLIENT_URL}/quotes/${quote._id}/respond`;
  const qrDataUrl = await QRCode.toDataURL(qrLink, { margin: 0, width: 160 });
  const qrBuffer = Buffer.from(qrDataUrl.split(",")[1], "base64");

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        margin: PAGE.margin,
        bufferPages: true,
        info: {
          Title: `Zusko Quote ${quote.quoteNumber}`,
          Author: "Zusko Laundry Services",
        },
      });

      const chunks = [];
      doc.on("data", (c) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      drawRunningHeader(doc);
      renderDocument(doc, quote, lead);

      // Inject the QR image into the reserved slot
      if (doc._quoteQrSlot) {
        const { x, y, size } = doc._quoteQrSlot;
        doc.image(qrBuffer, x, y, { width: size, height: size });
      }

      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        drawFooter(doc, i + 1);
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

export { generateQuotePDF };