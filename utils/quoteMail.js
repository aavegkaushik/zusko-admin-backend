import nodemailer from "nodemailer";

let transporter;

/** Lazily creates a single reusable SMTP transporter. */
function getTransporter() {
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  return transporter;
}

function money(value) {
  const n = Number(value || 0);
  return `Rs. ${n.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
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

/** Builds the HTML body of the quote email. */
function buildEmailHtml(lead, quote) {
  const respondUrl = `${
  process.env.BUSINESS_URL || "https://localhost:5174"
}/quotes/${quote._id}/respond`;

  const rows = quote.services
    .map(
      (s) => `
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #E2E8F0;color:#0B1220;font-size:13px;">${s.serviceName}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #E2E8F0;color:#475569;font-size:13px;text-align:center;">${s.quantity} ${s.unit}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #E2E8F0;color:#475569;font-size:13px;text-align:right;">${money(
            s.price
          )}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #E2E8F0;color:#0B1220;font-size:13px;text-align:right;font-weight:600;">${money(
            s.subtotal
          )}</td>
        </tr>`
    )
    .join("");

  return `
  <div style="background:#F1F5F9;padding:32px 0;font-family:Helvetica,Arial,sans-serif;">
    <table width="600" align="center" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:12px;overflow:hidden;">
      <tr>
        <td style="background:#0B1220;padding:28px 32px;">
          <span style="color:#FFFFFF;font-size:20px;font-weight:700;letter-spacing:0.5px;">ZUSKO</span>
          <div style="color:#5EEAD4;font-size:11px;letter-spacing:1px;margin-top:2px;">PROFESSIONAL LAUNDRY SERVICES</div>
        </td>
      </tr>

      <tr>
        <td style="padding:32px;">
          <p style="color:#0B1220;font-size:16px;margin:0 0 4px;">
            Hi ${lead.ownerName || lead.businessName},
          </p>

          <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 20px;">
            Thank you for considering Zusko for ${
              lead.businessName
            }'s laundry needs.
            Please find your personalized service proposal
            <b>${quote.quoteNumber}</b> below,
            valid until <b>${formatDate(quote.validTill)}</b>.
          </p>

          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E2E8F0;border-radius:8px;overflow:hidden;margin-bottom:20px;">
            <thead>
              <tr style="background:#E6F4F2;">
                <td style="padding:10px 12px;font-size:11px;color:#0F766E;font-weight:700;">SERVICE</td>
                <td style="padding:10px 12px;font-size:11px;color:#0F766E;font-weight:700;text-align:center;">QTY</td>
                <td style="padding:10px 12px;font-size:11px;color:#0F766E;font-weight:700;text-align:right;">RATE</td>
                <td style="padding:10px 12px;font-size:11px;color:#0F766E;font-weight:700;text-align:right;">SUBTOTAL</td>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>

          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
            <tr>
              <td style="color:#475569;font-size:13px;padding:4px 0;">Grand Total</td>
              <td style="color:#0F766E;font-size:18px;font-weight:700;text-align:right;padding:4px 0;">
                ${money(quote.grandTotal)}
              </td>
            </tr>
          </table>

          <div style="text-align:center;margin-bottom:24px;">
            <a href="${respondUrl}" style="background:#0F766E;color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:600;padding:12px 28px;border-radius:8px;display:inline-block;">
              View &amp; Respond to Quote
            </a>
          </div>

          <p style="color:#94A3B8;font-size:12px;line-height:1.6;margin:0;">
            The complete quotation, including terms and conditions,
            is attached as a PDF. For any questions, reply to this
            email or call us at ${
              process.env.SUPPORT_PHONE || "+91 8004411976"
            }.
          </p>
        </td>
      </tr>

      <tr>
        <td style="background:#F8FAFC;padding:20px 32px;border-top:1px solid #E2E8F0;">
          <p style="color:#94A3B8;font-size:11px;margin:0;">
            © ${new Date().getFullYear()} Zusko Laundry Services Pvt. Ltd.
            All rights reserved.
          </p>
        </td>
      </tr>
    </table>
  </div>`;
}

/**
 * Sends the quote email with the PDF attached.
 *
 * @param {Object} lead
 * @param {Object} quote
 * @param {Buffer} pdfBuffer
 */
export async function sendQuoteEmail(lead, quote, pdfBuffer) {
  if (!lead.email) {
    throw new Error("Lead has no email address on file.");
  }

  const mailer = getTransporter();

  const info = await mailer.sendMail({
    from: `"Zusko Commercial Laundry Services" <${
      process.env.SMTP_QUOTE_MAIL || process.env.SMTP_USER
    }>`,
    to: lead.email,
    subject: "Your Commercial Laundry Service Proposal from Zusko",
    html: buildEmailHtml(lead, quote),
    attachments: [
      {
        filename: `${quote.quoteNumber}.pdf`,
        content: pdfBuffer,
        contentType: "application/pdf",
      },
    ],
  });
  console.log("Mail Info:", info);
}

