import fs from 'fs'
import path from 'path'

import BusinessQuote from "../Models/businessQuote.model.js";
import BusinessLead from "../Models/BusinessLead.js";
import BusinessCustomer from "../Models/Businesscustomer.js";

import { generateQuoteNumber } from "../utils/quoteNumber.js";
import { generateQuotePDF as buildQuotePDF } from "../utils/quotePdf.js";
import { sendQuoteEmail as sendQuoteEmailUtil } from "../utils/quoteMail.js";

import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UPLOAD_DIR = path.join(__dirname, "../uploads/quotes");
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

/* ------------------------------------------------------------------ */
/* Shared calculation helper                                          */
/* Recomputed server-side on every create/update so totals can never   */
/* be spoofed or drift from what the client displayed.                 */
/* ------------------------------------------------------------------ */

function computeTotals({ services, discount, gst, pickupCharge, additionalCharges }) {
  const normalizedServices = (services || []).map((s) => {
    const quantity = Number(s.quantity || 0);
    const minimumQuantity = Number(s.minimumQuantity || 0);
    const price = Number(s.price || 0);
    const billableQty = Math.max(quantity, minimumQuantity);
    const subtotal = Number((billableQty * price).toFixed(2));
    return {
      serviceName: s.serviceName,
      unit: s.unit,
      price,
      minimumQuantity,
      quantity,
      subtotal,
    };
  });

  const subtotal = Number(
    normalizedServices.reduce((sum, s) => sum + s.subtotal, 0).toFixed(2)
  );

  const discountType = discount?.type === "flat" ? "flat" : "percentage";
  const discountValue = Number(discount?.value || 0);
  const discountAmount = Number(
    (discountType === "percentage"
      ? (subtotal * discountValue) / 100
      : discountValue
    ).toFixed(2)
  );

  const pickup = Number(pickupCharge || 0);

  const normalizedCharges = (additionalCharges || []).map((c) => ({
    label: c.label,
    amount: Number(c.amount || 0),
  }));
  const additionalChargesTotal = Number(
    normalizedCharges.reduce((sum, c) => sum + c.amount, 0).toFixed(2)
  );

  const taxableValue = Number(
    (subtotal - discountAmount + pickup + additionalChargesTotal).toFixed(2)
  );

  const gstPercentage = Number(gst?.percentage ?? 18);
  const gstAmount = Number(((taxableValue * gstPercentage) / 100).toFixed(2));

  const grandTotal = Number((taxableValue + gstAmount).toFixed(2));

  return {
    services: normalizedServices,
    subtotal,
    discount: { type: discountType, value: discountValue, amount: discountAmount },
    pickupCharge: pickup,
    additionalCharges: normalizedCharges,
    gst: { percentage: gstPercentage, amount: gstAmount },
    grandTotal,
  };
}

/** Writes a PDF buffer to disk and returns the public-facing URL. */
function persistPdf(quoteNumber, buffer) {
  const filename = `${quoteNumber}.pdf`;
  const filePath = path.join(UPLOAD_DIR, filename);
  fs.writeFileSync(filePath, buffer);
  return `/uploads/quotes/${filename}`;
}

/* ------------------------------------------------------------------ */
/* Controllers                                                         */
/* ------------------------------------------------------------------ */

/** POST /api/business-quotes */
export const createQuote = async (req, res) => {
  try {
    const {
      leadId,
      validTill,
      paymentTerms,
      turnaroundTime,
      pickupFrequency,
      services,
      discount,
      gst,
      pickupCharge,
      additionalCharges,
      notes,
      terms,
    } = req.body;

    if (!leadId) {
      return res.status(400).json({ success: false, message: "leadId is required." });
    }
    if (!validTill) {
      return res.status(400).json({ success: false, message: "validTill is required." });
    }
    if (!Array.isArray(services) || services.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "At least one service line item is required." });
    }

    const lead = await BusinessLead.findById(leadId);
    if (!lead) {
      return res.status(404).json({ success: false, message: "Lead not found." });
    }

    const totals = computeTotals({ services, discount, gst, pickupCharge, additionalCharges });
    const quoteNumber = await generateQuoteNumber();

    const quote = await BusinessQuote.create({
      leadId,
      quoteNumber,
      validTill,
      paymentTerms,
      turnaroundTime,
      pickupFrequency,
      notes,
      terms,
      createdBy: req.user?._id,
      ...totals,
    });

    return res.status(201).json({ success: true, quote });
  } catch (err) {
    console.error("createQuote error:", err);
    return res.status(500).json({ success: false, message: "Failed to create quote." });
  }
};

/** GET /api/business-quotes */
export const getQuotes = async (req, res) => {
  try {
    const { status, leadId, search, page = 1, limit = 20 } = req.query;

    const filter = {};
    if (status) filter.status = status;
    if (leadId) filter.leadId = leadId;
    if (search) filter.quoteNumber = { $regex: search, $options: "i" };

    const pageNum = Math.max(Number(page) || 1, 1);
    const limitNum = Math.min(Math.max(Number(limit) || 20, 1), 100);

    const [quotes, total] = await Promise.all([
      BusinessQuote.find(filter)
        .populate("leadId", "businessName ownerName city phone email status")
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum),
      BusinessQuote.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      quotes,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (err) {
    console.error("getQuotes error:", err);
    return res.status(500).json({ success: false, message: "Failed to fetch quotes." });
  }
};

/** GET /api/business-quotes/:id */
export const getQuoteById = async (req, res) => {
  try {
    const quote = await BusinessQuote.findById(req.params.id).populate("leadId");
    if (!quote) {
      return res.status(404).json({ success: false, message: "Quote not found." });
    }
    return res.json({ success: true, quote });
  } catch (err) {
    console.error("getQuoteById error:", err);
    return res.status(500).json({ success: false, message: "Failed to fetch quote." });
  }
};

/** PATCH /api/business-quotes/:id */
export const updateQuote = async (req, res) => {
  try {
    const quote = await BusinessQuote.findById(req.params.id);
    if (!quote) {
      return res.status(404).json({ success: false, message: "Quote not found." });
    }
    if (quote.status === "Accepted") {
      return res
        .status(409)
        .json({ success: false, message: "An accepted quote cannot be edited." });
    }

    const editable = [
      "validTill",
      "paymentTerms",
      "turnaroundTime",
      "pickupFrequency",
      "notes",
      "terms",
    ];
    editable.forEach((field) => {
      if (req.body[field] !== undefined) quote[field] = req.body[field];
    });

    // Recompute totals whenever any pricing-relevant field is touched
    const pricingTouched = ["services", "discount", "gst", "pickupCharge", "additionalCharges"].some(
      (f) => req.body[f] !== undefined
    );

    if (pricingTouched) {
      const totals = computeTotals({
        services: req.body.services ?? quote.services,
        discount: req.body.discount ?? quote.discount,
        gst: req.body.gst ?? quote.gst,
        pickupCharge: req.body.pickupCharge ?? quote.pickupCharge,
        additionalCharges: req.body.additionalCharges ?? quote.additionalCharges,
      });
      Object.assign(quote, totals);
    }

    await quote.save();
    return res.json({ success: true, quote });
  } catch (err) {
    console.error("updateQuote error:", err);
    return res.status(500).json({ success: false, message: "Failed to update quote." });
  }
};

/** DELETE /api/business-quotes/:id */
export const deleteQuote = async (req, res) => {
  try {
    const quote = await BusinessQuote.findById(req.params.id);
    if (!quote) {
      return res.status(404).json({ success: false, message: "Quote not found." });
    }
    if (quote.status === "Accepted") {
      return res
        .status(409)
        .json({ success: false, message: "An accepted quote cannot be deleted." });
    }

    if (quote.pdfUrl) {
      const filePath = path.join(__dirname, "..", quote.pdfUrl);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    await quote.deleteOne();
    return res.json({ success: true, message: "Quote deleted." });
  } catch (err) {
    console.error("deleteQuote error:", err);
    return res.status(500).json({ success: false, message: "Failed to delete quote." });
  }
};

/** POST /api/business-quotes/:id/pdf */
export const generateQuotePDF = async (req, res) => {
  try {
    const quote = await BusinessQuote.findById(req.params.id).populate("leadId");
    if (!quote) {
      return res.status(404).json({ success: false, message: "Quote not found." });
    }

    const pdfBuffer = await buildQuotePDF(quote, quote.leadId);
    const pdfUrl = persistPdf(quote.quoteNumber, pdfBuffer);

    quote.pdfUrl = pdfUrl;
    await quote.save();

    return res.json({ success: true, pdfUrl, quote });
  } catch (err) {
    console.error(err);

    return res.status(500).json({
        success:false,
        message: err.message,
        stack: err.stack
    });
}
};

/** POST /api/business-quotes/:id/send */
export const sendQuoteEmail = async (req, res) => {
  try {
    const quote = await BusinessQuote.findById(req.params.id).populate("leadId");
    if (!quote) {
      return res.status(404).json({ success: false, message: "Quote not found." });
    }
    if (!quote.leadId?.email) {
      return res
        .status(400)
        .json({ success: false, message: "This lead has no email address on file." });
    }

    // Always regenerate the PDF before sending so the attachment reflects
    // the latest edits, even if a stale PDF was generated earlier.
    const pdfBuffer = await buildQuotePDF(quote, quote.leadId);
    const pdfUrl = persistPdf(quote.quoteNumber, pdfBuffer);
    quote.pdfUrl = pdfUrl;

    await sendQuoteEmailUtil(
    quote.leadId,
    quote,
    pdfBuffer
);

    quote.status = "Sent";
    quote.sentAt = new Date();
    await quote.save();

    await BusinessLead.findByIdAndUpdate(
    quote.leadId._id,
    {
        status: "QUOTE_SENT",
        quoteSent: true,
        latestQuote: quote._id,
    }
);

    return res.json({ success: true, message: "Quote emailed successfully.", quote });
  } catch (err) {
    console.error("sendQuoteEmail error:", err);
    return res.status(500).json({ success: false, message: "Failed to send quote email." });
  }
};

export const getQuoteByLead = async (req,res)=>{

const quote = await BusinessQuote.findOne({
    leadId:req.params.leadId
}).sort({createdAt:-1});

res.json({
    success:true,
    quote
})

}

/** POST /api/business-quotes/:id/accept */
export const acceptQuote = async (req, res) => {
  try {
    const quote = await BusinessQuote.findById(req.params.id).populate("leadId");
    if (!quote) {
      return res.status(404).json({ success: false, message: "Quote not found." });
    }
    if (quote.status === "Accepted") {
      return res.status(409).json({ success: false, message: "Quote is already accepted." });
    }

    const lead = quote.leadId;

    quote.status = "Accepted";
    quote.acceptedAt = new Date();
    await quote.save();

    const customer = await BusinessCustomer.create({
      businessName: lead.businessName,
      website: lead.website,
      ownerName: lead.ownerName,
      phone: lead.phone,
      email: lead.email,
      city: lead.city,
      address: lead.address,
      businessType: lead.businessType,
      leadId: lead._id,
      convertedFromQuote: quote._id,
      activeServices: quote.services.map((s) => s.serviceName),
      pickupFrequency: quote.pickupFrequency,
    });

    await BusinessLead.findByIdAndUpdate(lead._id, { converted: true });

    return res.json({ success: true, message: "Quote accepted.", quote, customer });
  } catch (err) {
    console.error("acceptQuote error:", err);
    return res.status(500).json({ success: false, message: "Failed to accept quote." });
  }
};

/** POST /api/business-quotes/:id/reject */
export const rejectQuote = async (req, res) => {
  try {
    const quote = await BusinessQuote.findById(req.params.id);
    if (!quote) {
      return res.status(404).json({ success: false, message: "Quote not found." });
    }
    if (quote.status === "Accepted") {
      return res
        .status(409)
        .json({ success: false, message: "An accepted quote cannot be rejected." });
    }

    quote.status = "Rejected";
    quote.rejectedAt = new Date();
    await quote.save();

    return res.json({ success: true, message: "Quote rejected.", quote });
  } catch (err) {
    console.error("rejectQuote error:", err);
    return res.status(500).json({ success: false, message: "Failed to reject quote." });
  }
};

/** POST /api/business-quotes/:id/duplicate */
export const duplicateQuote = async (req, res) => {
  try {
    const original = await BusinessQuote.findById(req.params.id);
    if (!original) {
      return res.status(404).json({ success: false, message: "Quote not found." });
    }

    const quoteNumber = await generateQuoteNumber();

    const duplicate = await BusinessQuote.create({
      leadId: original.leadId,
      quoteNumber,
      status: "Draft",
      validTill: original.validTill,
      paymentTerms: original.paymentTerms,
      turnaroundTime: original.turnaroundTime,
      pickupFrequency: original.pickupFrequency,
      services: original.services,
      subtotal: original.subtotal,
      discount: original.discount,
      gst: original.gst,
      pickupCharge: original.pickupCharge,
      additionalCharges: original.additionalCharges,
      grandTotal: original.grandTotal,
      notes: original.notes,
      terms: original.terms,
      createdBy: req.user?._id,
    });

    return res.status(201).json({ success: true, quote: duplicate });
  } catch (err) {
    console.error("duplicateQuote error:", err);
    return res.status(500).json({ success: false, message: "Failed to duplicate quote." });
  }
};