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

/* ------------------------------------------------------------------ */
/* Builds the premium Yellow-theme quote email                       */
/* ------------------------------------------------------------------ */

function buildEmailHtml(lead, quote) {
  const respondUrl = `${
    process.env.BUSINESS_URL || "https://zusko.in"
  }/quotes/${quote._id}/respond`;

  const rows = (quote.services || [])
    .map(
      (s) => `
        <tr>
          <td
            style="
              padding:12px 14px;
              border-bottom:1px solid #E5E5E5;
              color:#181818;
              font-size:13px;
              line-height:1.4;
            "
          >
            ${s.serviceName || "-"}
          </td>

          <td
            style="
              padding:12px 14px;
              border-bottom:1px solid #E5E5E5;
              color:#555555;
              font-size:13px;
              text-align:center;
              white-space:nowrap;
            "
          >
            ${s.quantity || 0} ${s.unit || ""}
          </td>

          <td
            style="
              padding:12px 14px;
              border-bottom:1px solid #E5E5E5;
              color:#555555;
              font-size:13px;
              text-align:right;
              white-space:nowrap;
            "
          >
            ${money(s.price)}
          </td>

          <td
            style="
              padding:12px 14px;
              border-bottom:1px solid #E5E5E5;
              color:#181818;
              font-size:13px;
              text-align:right;
              font-weight:700;
              white-space:nowrap;
            "
          >
            ${money(s.subtotal)}
          </td>
        </tr>
      `
    )
    .join("");

    

  return `
  <!DOCTYPE html>

  <html>
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />

      <title>
        ${quote.quoteNumber || "Zusko Quote"}
      </title>
    </head>

    <body
      style="
        margin:0;
        padding:0;
        background:#F7F7F5;
        font-family:Arial,Helvetica,sans-serif;
        color:#181818;
      "
    >

      <!-- ========================================================= -->
      <!-- EMAIL WRAPPER                                             -->
      <!-- ========================================================= -->

      <div
        style="
          width:100%;
          background:#F7F7F5;
          padding:32px 12px;
          box-sizing:border-box;
        "
      >

        <table
          width="100%"
          cellpadding="0"
          cellspacing="0"
          border="0"
          style="
            max-width:620px;
            margin:0 auto;
            background:#FFFFFF;
            border-radius:16px;
            overflow:hidden;
            border:1px solid #E5E5E5;
          "
        >

          <!-- ===================================================== -->
          <!-- YELLOW TOP BAR                                        -->
          <!-- ===================================================== -->

          <tr>
            <td
              style="
                height:6px;
                background:#FACC15;
                font-size:0;
                line-height:0;
              "
            >
              &nbsp;
            </td>
          </tr>


          <!-- ===================================================== -->
          <!-- HEADER                                                 -->
          <!-- ===================================================== -->

          <tr>
            <td
              style="
                padding:28px 32px 24px;
                background:#FFFFFF;
              "
            >

              <table
                width="100%"
                cellpadding="0"
                cellspacing="0"
                border="0"
              >
                <tr>

                  <!-- BRAND -->

                  <td
                    valign="middle"
                    style="
                      padding:0;
                    "
                  >

                    <div
                      style="
                        color:#181818;
                        font-size:25px;
                        line-height:28px;
                        font-weight:800;
                        letter-spacing:0.5px;
                      "
                    >
                      ZUSKO
                    </div>

                    <div
                      style="
                        color:#8A8A8A;
                        font-size:9px;
                        line-height:13px;
                        letter-spacing:1.4px;
                        margin-top:3px;
                        font-weight:600;
                      "
                    >
                      PROFESSIONAL LAUNDRY SERVICES
                    </div>

                  </td>


                  <!-- QUOTE NUMBER -->

                  <td
                    valign="middle"
                    align="right"
                    style="
                      padding:0;
                    "
                  >

                    <div
                      style="
                        display:inline-block;
                        background:#FFF8D6;
                        border:1px solid #F1D45A;
                        border-radius:8px;
                        padding:8px 12px;
                        color:#181818;
                        font-size:11px;
                        font-weight:700;
                      "
                    >
                      ${quote.quoteNumber || "-"}
                    </div>

                  </td>

                </tr>
              </table>

            </td>
          </tr>


          <!-- ===================================================== -->
          <!-- YELLOW DIVIDER                                         -->
          <!-- ===================================================== -->

          <tr>
            <td
              style="
                padding:0 32px;
              "
            >

              <div
                style="
                  height:2px;
                  background:#FACC15;
                  width:100%;
                "
              >
              </div>

            </td>
          </tr>


          <!-- ===================================================== -->
          <!-- INTRODUCTION                                           -->
          <!-- ===================================================== -->

          <tr>
            <td
              style="
                padding:30px 32px 10px;
              "
            >

              <div
                style="
                  color:#181818;
                  font-size:16px;
                  font-weight:600;
                  margin-bottom:8px;
                "
              >
                Hi ${lead.ownerName || lead.businessName || "there"},
              </div>


              <div
                style="
                  color:#555555;
                  font-size:14px;
                  line-height:1.7;
                "
              >

                Thank you for considering
                <strong style="color:#181818;">
                  Zusko
                </strong>
                for
                <strong style="color:#181818;">
                  ${lead.businessName || "your business"}
                </strong>
                's laundry requirements.

                <br /><br />

                Please find your personalized service proposal
                <strong style="color:#181818;">
                  ${quote.quoteNumber || ""}
                </strong>
                below.

                This quotation is valid until
                <strong style="color:#181818;">
                  ${formatDate(quote.validTill)}
                </strong>.

              </div>

            </td>
          </tr>


          <!-- ===================================================== -->
          <!-- QUOTE SUMMARY LABEL                                    -->
          <!-- ===================================================== -->

          <tr>
            <td
              style="
                padding:18px 32px 10px;
              "
            >

              <div
                style="
                  color:#181818;
                  font-size:12px;
                  font-weight:800;
                  letter-spacing:0.8px;
                "
              >
                SERVICE PROPOSAL
              </div>

              <div
                style="
                  width:34px;
                  height:3px;
                  background:#FACC15;
                  margin-top:6px;
                "
              >
              </div>

            </td>
          </tr>


          <!-- ===================================================== -->
          <!-- SERVICES TABLE                                         -->
          <!-- ===================================================== -->

          <tr>
            <td
              style="
                padding:8px 32px 0;
              "
            >

              <table
                width="100%"
                cellpadding="0"
                cellspacing="0"
                border="0"
                style="
                  border:1px solid #E5E5E5;
                  border-radius:10px;
                  overflow:hidden;
                  border-collapse:separate;
                "
              >

                <!-- TABLE HEADER -->

                <thead>
                  <tr>

                    <td
                      style="
                        padding:11px 14px;
                        background:#FACC15;
                        color:#181818;
                        font-size:10px;
                        font-weight:800;
                        letter-spacing:0.5px;
                      "
                    >
                      SERVICE
                    </td>

                    <td
                      style="
                        padding:11px 14px;
                        background:#FACC15;
                        color:#181818;
                        font-size:10px;
                        font-weight:800;
                        letter-spacing:0.5px;
                        text-align:center;
                      "
                    >
                      QTY
                    </td>

                    <td
                      style="
                        padding:11px 14px;
                        background:#FACC15;
                        color:#181818;
                        font-size:10px;
                        font-weight:800;
                        letter-spacing:0.5px;
                        text-align:right;
                      "
                    >
                      RATE
                    </td>

                    <td
                      style="
                        padding:11px 14px;
                        background:#FACC15;
                        color:#181818;
                        font-size:10px;
                        font-weight:800;
                        letter-spacing:0.5px;
                        text-align:right;
                      "
                    >
                      TOTAL
                    </td>

                  </tr>
                </thead>


                <tbody>
                  ${rows}
                </tbody>

              </table>

            </td>
          </tr>


          <!-- ===================================================== -->
          <!-- TOTAL                                                 -->
          <!-- ===================================================== -->

          <tr>
            <td
              style="
                padding:20px 32px 0;
              "
            >

              <table
                width="100%"
                cellpadding="0"
                cellspacing="0"
                border="0"
                style="
                  background:#FFFBEA;
                  border:1px solid #F1D45A;
                  border-radius:10px;
                "
              >

                <tr>

                  <td
                    style="
                      padding:16px;
                      color:#555555;
                      font-size:13px;
                    "
                  >
                    Grand Total
                  </td>

                  <td
                    style="
                      padding:16px;
                      color:#181818;
                      font-size:20px;
                      font-weight:800;
                      text-align:right;
                    "
                  >
                    ${money(quote.grandTotal)}
                  </td>

                </tr>

              </table>

            </td>
          </tr>


          <!-- ===================================================== -->
          <!-- RESPONSE CTA                                          -->
          <!-- ===================================================== -->

          <tr>
            <td
              align="center"
              style="
                padding:28px 32px 14px;
              "
            >

              <a
                href="${respondUrl}"
                target="_blank"
                style="
                  display:inline-block;
                  background:#181818;
                  color:#FACC15;
                  text-decoration:none;
                  font-size:14px;
                  font-weight:800;
                  padding:14px 30px;
                  border-radius:9px;
                  letter-spacing:0.2px;
                "
              >
                View &amp; Respond to Quote
              </a>

            </td>
          </tr>


          <!-- ===================================================== -->
          <!-- RESPONSE EXPLANATION                                   -->
          <!-- ===================================================== -->

          <tr>
            <td
              align="center"
              style="
                padding:0 32px 28px;
              "
            >

              <div
                style="
                  color:#777777;
                  font-size:11px;
                  line-height:1.6;
                  max-width:430px;
                  margin:0 auto;
                "
              >

                Click the button above to view your complete quotation
                and submit your response securely online.

                <br />

                You can accept or decline the proposal directly from
                the Zusko quote page.

              </div>

            </td>
          </tr>


          <!-- ===================================================== -->
          <!-- PDF NOTE                                              -->
          <!-- ===================================================== -->

          <tr>
            <td
              style="
                padding:0 32px 28px;
              "
            >

              <div
                style="
                  background:#F7F7F5;
                  border:1px solid #E5E5E5;
                  border-radius:9px;
                  padding:14px 16px;
                  color:#777777;
                  font-size:11px;
                  line-height:1.6;
                "
              >

                <strong style="color:#181818;">
                  PDF quotation attached
                </strong>

                <br />

                The complete quotation, including pricing,
                terms and conditions, is attached to this email.

                For any questions, reply to this email or contact us at
                <strong style="color:#181818;">
                  ${
                    process.env.SUPPORT_PHONE ||
                    "+91 8004411976"
                  }
                </strong>.

              </div>

            </td>
          </tr>


          <!-- ===================================================== -->
          <!-- FOOTER                                                -->
          <!-- ===================================================== -->

          <tr>
            <td
              style="
                background:#181818;
                padding:22px 32px;
              "
            >

              <table
                width="100%"
                cellpadding="0"
                cellspacing="0"
                border="0"
              >

                <tr>

                  <td
                    style="
                      color:#FFFFFF;
                      font-size:12px;
                      font-weight:700;
                    "
                  >
                    ZUSKO
                  </td>

                  <td
                    align="right"
                    style="
                      color:#FACC15;
                      font-size:10px;
                      font-weight:600;
                    "
                  >
                    PROFESSIONAL LAUNDRY SERVICES
                  </td>

                </tr>

              </table>


              <div
                style="
                  height:1px;
                  background:#333333;
                  margin:14px 0;
                "
              >
              </div>


              <div
                style="
                  color:#999999;
                  font-size:10px;
                  line-height:1.6;
                "
              >

                © ${new Date().getFullYear()}
                Zusko Laundry Services Pvt. Ltd.
                All rights reserved.

              </div>

            </td>
          </tr>

        </table>

      </div>

    </body>
  </html>
  `;
}


/* ------------------------------------------------------------------ */
/* Sends the quote email with the PDF attached.                      */
/* ------------------------------------------------------------------ */

/**
 * @param {Object} lead
 * @param {Object} quote
 * @param {Buffer} pdfBuffer
 */

export async function sendQuoteEmail(
  lead,
  quote,
  pdfBuffer
) {
  if (!lead.email) {
    throw new Error(
      "Lead has no email address on file."
    );
  }

  const mailer =
    getTransporter();

  const info =
    await mailer.sendMail({
      from: `"Zusko Commercial Laundry Services" <${
        process.env.SMTP_QUOTE_MAIL ||
        process.env.SMTP_USER
      }>`,
      to: lead.email,

      subject:
        "Your Commercial Laundry Service Proposal from Zusko",

      html:
        buildEmailHtml(
          lead,
          quote
        ),

      attachments: [
        {
          filename:
            `${quote.quoteNumber}.pdf`,

          content:
            pdfBuffer,

          contentType:
            "application/pdf",
        },
      ],
    });

  console.log(
    "Mail Info:",
    info
  );
}