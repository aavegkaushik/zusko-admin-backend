import express from 'express'
const router = express.Router();
import {createQuote,
  getQuotes,
  getQuoteById,
  updateQuote,
  deleteQuote,
  generateQuotePDF,
  sendQuoteEmail,
  acceptQuote,
  rejectQuote,
  duplicateQuote,
  getQuoteByLead,} from '../controllers/businessQuote.controller.js'

router.post("/", createQuote);
router.get("/", getQuotes);
router.get("/:id", getQuoteById);
router.patch("/:id", updateQuote);
router.delete("/:id", deleteQuote);
router.get(
    "/lead/:leadId",
    getQuoteByLead
);
router.post("/:id/pdf", generateQuotePDF);
router.post("/:id/send", sendQuoteEmail);
router.post("/:id/accept", acceptQuote);
router.post("/:id/reject", rejectQuote);
router.post("/:id/duplicate", duplicateQuote);

export default router