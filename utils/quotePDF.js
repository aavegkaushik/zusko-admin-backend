import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

/* ------------------------------------------------------------------ */
/* Design tokens - Bluish Green → Yellow                              */
/* ------------------------------------------------------------------ */

const COLORS = {
  ink: "#181818",
  slate: "#555555",
  muted: "#888888",

  // Pure Yellow Theme
  accent: "#EAB308",
  accentDark: "#B77900",
  accentSoft: "#FFF8D6",
  yellow: "#FACC15",
  yellowSoft: "#FFFBEA",

  border: "#E5E5E5",
  rowAlt: "#FFFDF3",

  danger: "#D64545",
};

const FONT = {
  regular: "Helvetica",
  bold: "Helvetica-Bold",
};

const PAGE = {
  width: 595.28,
  height: 841.89,
  margin: 50,
};

const CONTENT_WIDTH = PAGE.width - PAGE.margin * 2;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOGO_PATH = path.join(__dirname, "../public/image/fullLogo.png");

const SUPPORT_EMAIL =
  process.env.SUPPORT_EMAIL || "info@zusko.in";

const SUPPORT_PHONE =
  process.env.SUPPORT_PHONE || "+91 8004411976";

const CLIENT_URL =
  process.env.CLIENT_URL || "https://zusko.in";

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
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

/* ------------------------------------------------------------------ */
/* Header                                                             */
/* ------------------------------------------------------------------ */




function drawRunningHeader(doc) {
  doc
    .rect(0, 0, PAGE.width, 5)
    .fill(COLORS.yellow);
}

/* ------------------------------------------------------------------ */
/* Footer                                                             */
/* ------------------------------------------------------------------ */

function drawFooter(doc, pageNumber) {
  const y = PAGE.height - 38;

  // Thin separator
  doc
    .moveTo(PAGE.margin, y)
    .lineTo(PAGE.width - PAGE.margin, y)
    .lineWidth(0.5)
    .strokeColor(COLORS.border)
    .stroke();

  // Brand
  doc
    .font(FONT.bold)
    .fontSize(7.5)
    .fillColor(COLORS.ink)
    .text(
      "ZUSKO",
      PAGE.margin,
      y + 9
    );

  // Contact information
  doc
    .font(FONT.regular)
    .fontSize(7)
    .fillColor(COLORS.muted)
    .text(
      "Laundry Services  •  info@zusko.in  •  +91 8004411976",
      PAGE.margin + 38,
      y + 9,
      {
        width: CONTENT_WIDTH - 90,
        align: "left",
      }
    );

  // Page number
  doc
    .font(FONT.bold)
    .fontSize(7)
    .fillColor(COLORS.accentDark)
    .text(
      `${pageNumber}`,
      PAGE.width - PAGE.margin - 25,
      y + 9,
      {
        width: 25,
        align: "right",
      }
    );
}

/* ------------------------------------------------------------------ */
/* Main PDF Renderer                                                  */
/* IMPORTANT: This renderer intentionally stays on ONE A4 page.       */
/* ------------------------------------------------------------------ */

function renderDocument(doc, quote, lead) {
  let y = 38;

  /* ================================================================ */
  /* HEADER                                                            */
  /* ================================================================ */

  const headerH = 78;

  const cardWidth = 205;

  const cardX =
    PAGE.width -
    PAGE.margin -
    cardWidth;

  // Logo
if (fs.existsSync(LOGO_PATH)) {
  doc.image(LOGO_PATH, PAGE.margin, y, {
    width: 125,
    height: 53,
    fit: [125, 53],
    align: "left",
    valign: "center",
  });
}

  /* Quote information card */

  doc
    .roundedRect(
      cardX,
      y - 3,
      cardWidth,
      66,
      9
    )
    .fillAndStroke(
      COLORS.accentSoft,
      COLORS.border
    );

  // Accent vertical bar
  doc
    .roundedRect(
      cardX,
      y - 3,
      6,
      66,
      9
    )
    .fill(COLORS.accent);

  doc
    .font(FONT.bold)
    .fontSize(12)
    .fillColor(COLORS.accentDark)
    .text(
      quote.quoteNumber || "-",
      cardX + 16,
      y + 7,
      {
        width: cardWidth - 28,
      }
    );

  doc
    .font(FONT.regular)
    .fontSize(8.5)
    .fillColor(COLORS.slate)
    .text(
      `Date: ${formatDate(
        quote.createdAt || Date.now()
      )}`,
      cardX + 16,
      y + 28
    )
    .text(
      `Valid Till: ${formatDate(
        quote.validTill
      )}`,
      cardX + 16,
      y + 41
    )
    .text(
      `Status: ${quote.status || "-"}`,
      cardX + 16,
      y + 54
    );

  // Yellow separator
  doc
    .rect(
      PAGE.margin,
      y + headerH - 3,
      CONTENT_WIDTH,
      3
    )
    .fill(COLORS.yellow);

  y += headerH + 12;

  /* ================================================================ */
  /* PREPARED FOR / PREPARED BY                                       */
  /* ================================================================ */

  const gap = 20;

  const colWidth =
    (CONTENT_WIDTH - gap) / 2;

  doc
    .font(FONT.bold)
    .fontSize(8.5)
    .fillColor(COLORS.accentDark)
    .text(
      "PREPARED FOR",
      PAGE.margin,
      y
    )
    .text(
      "PREPARED BY",
      PAGE.margin + colWidth + gap,
      y
    );

  doc
    .font(FONT.bold)
    .fontSize(10)
    .fillColor(COLORS.ink)
    .text(
      lead.businessName || "-",
      PAGE.margin,
      y + 13,
      {
        width: colWidth,
      }
    )
    .text(
      "Zusko Laundry Services Pvt. Ltd.",
      PAGE.margin + colWidth + gap,
      y + 13,
      {
        width: colWidth,
      }
    );

  const leadLines = [
    lead.ownerName,
    lead.address,
    lead.city,
    lead.phone,
    lead.email,
  ]
    .filter(Boolean)
    .join("\n");

  const usLines = [
    "Corporate Office, Bundelkhand Innovation & Incubation Center Foundation",
    "Jhansi, Uttar Pradesh, India",
    SUPPORT_PHONE,
    SUPPORT_EMAIL,
  ].join("\n");

  doc
    .font(FONT.regular)
    .fontSize(7.8)
    .fillColor(COLORS.slate)
    .text(
      leadLines || "-",
      PAGE.margin,
      y + 29,
      {
        width: colWidth,
        height: 55,
        lineGap: 1.5,
      }
    )
    .text(
      usLines,
      PAGE.margin + colWidth + gap,
      y + 29,
      {
        width: colWidth,
        height: 55,
        lineGap: 1.5,
      }
    );

  y += 86;

  /* ================================================================ */
  /* SERVICE TABLE                                                     */
  /* ================================================================ */

  const cols = [
    {
      key: "serviceName",
      label: "SERVICE",
      width: 0.34,
    },
    {
      key: "quantity",
      label: "QTY",
      width: 0.10,
      align: "center",
    },
    {
      key: "unit",
      label: "UNIT",
      width: 0.13,
      align: "center",
    },
    {
      key: "price",
      label: "RATE",
      width: 0.17,
      align: "right",
    },
    {
      key: "subtotal",
      label: "SUBTOTAL",
      width: 0.26,
      align: "right",
    },
  ].map((c) => ({
    ...c,
    px: c.width * CONTENT_WIDTH,
  }));

  function colX(index) {
    let x = PAGE.margin;

    for (let i = 0; i < index; i++) {
      x += cols[i].px;
    }

    return x;
  }

  const tableHeaderH = 23;

  // Table header
doc
  .roundedRect(
    PAGE.margin,
    y,
    CONTENT_WIDTH,
    tableHeaderH,
    5
  )
  .fill(COLORS.yellow);

  doc
    .font(FONT.bold)
    .fontSize(7.8)
    .fillColor("#FFFFFF");

  cols.forEach((c, i) => {
    doc.text(
      c.label,
      colX(i) + 7,
      y + 7,
      {
        width: c.px - 14,
        align: c.align || "left",
      }
    );
  });

  y += tableHeaderH;

  const serviceRows =
    quote.services || [];

  // Smaller rows if there are many services
  const rowH =
    serviceRows.length > 10
      ? 17
      : 20;

  serviceRows.forEach(
    (item, idx) => {
      // Alternate rows
      if (idx % 2 === 1) {
        doc
          .rect(
            PAGE.margin,
            y,
            CONTENT_WIDTH,
            rowH
          )
          .fill(COLORS.rowAlt);
      }

      doc
        .font(FONT.regular)
        .fontSize(
          serviceRows.length > 10
            ? 7.5
            : 8.2
        )
        .fillColor(COLORS.ink);

      // Service
      doc.text(
        String(
          item.serviceName || "-"
        ),
        colX(0) + 7,
        y + 5,
        {
          width: cols[0].px - 14,
          height: rowH - 4,
          ellipsis: true,
        }
      );

      // Quantity
      doc.text(
        String(
          item.quantity ?? "-"
        ),
        colX(1) + 7,
        y + 5,
        {
          width: cols[1].px - 14,
          align: "center",
        }
      );

      // Unit
      doc.text(
        String(
          item.unit || "-"
        ),
        colX(2) + 7,
        y + 5,
        {
          width: cols[2].px - 14,
          align: "center",
        }
      );

      // Rate
      doc.text(
        money(item.price),
        colX(3) + 7,
        y + 5,
        {
          width: cols[3].px - 14,
          align: "right",
        }
      );

      // Subtotal
      doc
        .font(FONT.bold)
        .text(
          money(item.subtotal),
          colX(4) + 7,
          y + 5,
          {
            width:
              cols[4].px - 14,
            align: "right",
          }
        );

      y += rowH;
    }
  );

  // Table bottom line
  doc
    .moveTo(PAGE.margin, y)
    .lineTo(
      PAGE.width - PAGE.margin,
      y
    )
    .lineWidth(0.8)
    .strokeColor(COLORS.border)
    .stroke();

  y += 11;

  /* ================================================================ */
  /* NOTES + COMMERCIAL INFO + TOTALS                                 */
  /* ================================================================ */

  const totalsWidth = 218;

  const totalsX =
    PAGE.width -
    PAGE.margin -
    totalsWidth;

  const leftWidth =
    CONTENT_WIDTH -
    totalsWidth -
    20;

  const bottomTop = y;

  /* Notes */

  if (quote.notes) {
    doc
      .font(FONT.bold)
      .fontSize(8.5)
      .fillColor(COLORS.accentDark)
      .text(
        "NOTES",
        PAGE.margin,
        y
      );

    doc
      .font(FONT.regular)
      .fontSize(7.8)
      .fillColor(COLORS.slate)
      .text(
        quote.notes,
        PAGE.margin,
        y + 13,
        {
          width: leftWidth,
          height: 55,
          lineGap: 2,
        }
      );
  }

  /* Commercial strip */

  const stripY =
    y + (quote.notes ? 52 : 0);

  doc
    .roundedRect(
      PAGE.margin,
      stripY,
      leftWidth,
      58,
      7
    )
    .fillAndStroke(
      COLORS.yellowSoft,
      COLORS.border
    );

  const stripItems = [
    [
      "PAYMENT TERMS",
      quote.paymentTerms,
    ],
    [
      "TURNAROUND",
      quote.turnaroundTime,
    ],
    [
      "PICKUP",
      quote.pickupFrequency || "-",
    ],
  ];

  const stripColWidth =
    leftWidth / 3;

  stripItems.forEach(
    ([label, value], i) => {
      const x =
        PAGE.margin +
        i * stripColWidth +
        8;

      doc
        .font(FONT.bold)
        .fontSize(6.8)
        .fillColor(COLORS.accentDark)
        .text(
          label,
          x,
          stripY + 10,
          {
            width:
              stripColWidth - 14,
          }
        );

      doc
        .font(FONT.regular)
        .fontSize(7.8)
        .fillColor(COLORS.ink)
        .text(
          value || "-",
          x,
          stripY + 23,
          {
            width:
              stripColWidth - 14,
            height: 28,
          }
        );
    }
  );

  /* ================================================================ */
  /* TOTALS CARD                                                       */
  /* ================================================================ */

  doc
    .roundedRect(
      totalsX,
      bottomTop,
      totalsWidth,
      122,
      9
    )
    .fillAndStroke(
      "#F7FCFB",
      COLORS.border
    );

  let ty =
    bottomTop + 12;

  function totalRow(
    label,
    value,
    opts = {}
  ) {
    doc
      .font(
        opts.bold
          ? FONT.bold
          : FONT.regular
      )
      .fontSize(
        opts.bold
          ? 10.5
          : 8.2
      )
      .fillColor(
        opts.color ||
          COLORS.slate
      )
      .text(
        label,
        totalsX + 12,
        ty,
        {
          width:
            totalsWidth * 0.56 -
            12,
        }
      )
      .text(
        value,
        totalsX +
          totalsWidth *
            0.56,
        ty,
        {
          width:
            totalsWidth *
              0.44 -
            12,
          align: "right",
        }
      );

    ty += opts.bold
      ? 20
      : 16;
  }

  totalRow(
    "Subtotal",
    money(quote.subtotal)
  );

  /* Discount */

  if (
    quote.discount?.amount > 0
  ) {
    const label =
      quote.discount.type ===
      "percentage"
        ? `Discount (${quote.discount.value}%)`
        : "Discount";

    totalRow(
      label,
      `- ${money(
        quote.discount.amount
      )}`,
      {
        color:
          COLORS.danger,
      }
    );
  }

  /* Pickup charge */

  if (
    quote.pickupCharge > 0
  ) {
    totalRow(
      "Pickup Charge",
      money(
        quote.pickupCharge
      )
    );
  }

  /* Additional charges */

  (
    quote.additionalCharges ||
    []
  ).forEach((charge) => {
    totalRow(
      charge.label,
      money(charge.amount)
    );
  });

  /* GST */

  if (
    quote.gst?.amount > 0
  ) {
    totalRow(
      `GST (${quote.gst.percentage}%)`,
      money(
        quote.gst.amount
      )
    );
  }

  /* Grand total */

  ty += 2;

  doc
    .roundedRect(
      totalsX + 7,
      ty - 4,
      totalsWidth - 14,
      31,
      6
    )
    .fill(COLORS.accentSoft);

  doc
    .font(FONT.bold)
    .fontSize(10.5)
    .fillColor(
      COLORS.accentDark
    )
    .text(
      "GRAND TOTAL",
      totalsX + 17,
      ty + 5,
      {
        width: 100,
      }
    )
    .text(
      money(quote.grandTotal),
      totalsX + 112,
      ty + 5,
      {
        width:
          totalsWidth - 130,
        align: "right",
      }
    );

  /* ================================================================ */
  /* TERMS & CONDITIONS                                                */
  /* ================================================================ */

  const termsY = Math.max(
    stripY + 69,
    bottomTop + 136
  );

  doc
    .font(FONT.bold)
    .fontSize(8.5)
    .fillColor(
      COLORS.accentDark
    )
    .text(
      "TERMS & CONDITIONS",
      PAGE.margin,
      termsY
    );

  doc
    .font(FONT.regular)
    .fontSize(7.3)
    .fillColor(COLORS.slate)
    .text(
      quote.terms || "-",
      PAGE.margin,
      termsY + 13,
      {
        width:
          CONTENT_WIDTH - 105,
        height: 65,
        lineGap: 1.7,
      }
    );

  /* ================================================================ */
  /* SIGNATURE + QR                                                    */
  /* ================================================================ */

  const signY =
    PAGE.height - 132;

  doc
    .moveTo(
      PAGE.margin,
      signY + 38
    )
    .lineTo(
      PAGE.margin + 190,
      signY + 38
    )
    .lineWidth(0.8)
    .strokeColor(
      COLORS.border
    )
    .stroke();

  doc
    .font(FONT.regular)
    .fontSize(7.5)
    .fillColor(COLORS.slate)
    .text(
      "Authorized Signatory - Zusko Laundry Services",
      PAGE.margin,
      signY + 44
    );

  /* QR */

  const qrLink =
    `http://zusko.in/quotes/${quote._id}/respond`;

  doc._quoteQrSlot = {
    x:
      PAGE.width -
      PAGE.margin -
      82,

    y: signY - 2,

    size: 70,

    link: qrLink,
  };

  doc
    .font(FONT.regular)
    .fontSize(6.8)
    .fillColor(COLORS.muted)
    .text(
      "Scan to view & respond online",
      doc._quoteQrSlot.x - 17,
      signY + 70,
      {
        width: 105,
        align: "center",
      }
    );
}

/* ------------------------------------------------------------------ */
/* Generate Quote PDF                                                 */
/* ------------------------------------------------------------------ */

async function generateQuotePDF(
  quote,
  lead
) {
  const qrLink =
    `${CLIENT_URL}/quotes/${quote._id}/respond`;

  const qrDataUrl =
    await QRCode.toDataURL(
      qrLink,
      {
        margin: 0,
        width: 160,
      }
    );

  const qrBuffer = Buffer.from(
    qrDataUrl.split(",")[1],
    "base64"
  );

  return new Promise(
    (resolve, reject) => {
      try {
        const doc =
          new PDFDocument({
            size: "A4",
            margin: PAGE.margin,

            // Keep PDF as a single page
            bufferPages: true,

            info: {
              Title:
                `Zusko Quote ${quote.quoteNumber}`,
              Author:
                "Zusko Laundry Services",
            },
          });

        const chunks = [];

        doc.on(
          "data",
          (chunk) => {
            chunks.push(chunk);
          }
        );

        doc.on(
          "end",
          () => {
            resolve(
              Buffer.concat(chunks)
            );
          }
        );

        doc.on(
          "error",
          reject
        );

        /* Header */

        drawRunningHeader(doc);

        /* Main document */

        renderDocument(
          doc,
          quote,
          lead
        );

        /* Inject QR */

        if (
          doc._quoteQrSlot
        ) {
          const {
            x,
            y,
            size,
          } = doc._quoteQrSlot;

          doc.image(
            qrBuffer,
            x,
            y,
            {
              width: size,
              height: size,
            }
          );
        }

        /* Footer */

        const range =
          doc.bufferedPageRange();

        for (
          let i = range.start;
          i <
          range.start +
            range.count;
          i++
        ) {
          doc.switchToPage(i);

          drawFooter(
            doc,
            i + 1
          );
        }

        doc.end();
      } catch (err) {
        reject(err);
      }
    }
  );
}

export {
  generateQuotePDF,
};