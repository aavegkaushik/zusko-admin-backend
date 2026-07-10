import express from "express";

import {
//   applyJob,
  getJobs,
  createJob,
  getApplications,
  getApplicationById,
  updateApplicationStatus,
  deleteApplication,
} from "../controllers/career.controller.js";

// import upload from "../middleware/uploadResume.js";
import {
//   verifyToken,
//   verifyAdmin,
} from "../Middleware/auth.middleware.js";

const router = express.Router();

/* ==========================================
   PUBLIC ROUTES
========================================== */

/*
Get all active jobs
GET /api/careers/jobs
*/
router.get("/jobs", getJobs);

/*
Apply for a job
POST /api/careers/apply
*/
// router.post(
//   "/apply",
//   upload.single("resume"),
//   applyJob
// );

/* ==========================================
   ADMIN JOB ROUTES
========================================== */

/*
Create Job
POST /api/careers/jobs
*/
router.post(
  "/jobs",
//   verifyToken,
//   verifyAdmin,
  createJob
);

/* ==========================================
   ATS APPLICATION ROUTES
========================================== */

/*
Get all applications
GET /api/careers/applications
*/
router.get(
  "/applications",
//   verifyToken,
//   verifyAdmin,
  getApplications
);

/*
Get single application
GET /api/careers/applications/:id
*/
router.get(
  "/applications/:id",
//   verifyToken,
//   verifyAdmin,
  getApplicationById
);

/*
Update status
PATCH /api/careers/applications/:id/status
*/
router.patch(
  "/applications/:id/status",
//   verifyToken,
//   verifyAdmin,
  updateApplicationStatus
);

/*
Delete application
DELETE /api/careers/applications/:id
*/
router.delete(
  "/applications/:id",
//   verifyToken,
//   verifyAdmin,
  deleteApplication
);

export default router;