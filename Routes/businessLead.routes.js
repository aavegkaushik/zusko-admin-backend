import express from "express";

import {
  getBusinessLeads,
  getBusinessLead,
  updateBusinessLeadStatus,
} from "../controllers/businessLead.controller.js";

const router = express.Router();

router.get("/", getBusinessLeads);

router.get("/:id", getBusinessLead);

router.patch("/:id/status", updateBusinessLeadStatus);

export default router;