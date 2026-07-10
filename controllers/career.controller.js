import Job from "../Models/Job.model.js";
import Application from "../Models/Application.model.js";
import { sendEmail } from "../utils/sendmail.js";
// import { uploadToCloudinary } from "../utils/uploadToCloudinary.js";

/* ==========================================
   Apply Job
========================================== */
// export const applyJob = async (req, res) => {
//   try {
//     const {
//       fullName,
//       email,
//       phone,
//       coverLetter,
//       jobId,
//     } = req.body;

//     // Check duplicate application
//     const existing = await Application.findOne({
//       email,
//       job: jobId,
//     });

//     if (existing) {
//       return res.status(400).json({
//         success: false,
//         message:
//           "You have already applied for this position.",
//       });
//     }

//     // Resume validation
//     if (!req.file) {
//       return res.status(400).json({
//         success: false,
//         message: "Resume is required.",
//       });
//     }

//     // Upload to Cloudinary
//     const uploadedResume =
//       await uploadToCloudinary(req.file);

//     const application =
//       await Application.create({
//         job: jobId,
//         fullName,
//         email,
//         phone,
//         coverLetter,

//         resumeUrl:
//           uploadedResume.secure_url,

//         resumePublicId:
//           uploadedResume.public_id,

//         status: "Applied",
//       });

//     res.status(201).json({
//       success: true,
//       message:
//         "Application submitted successfully.",
//       application,
//     });
//   } catch (error) {
//     console.error(
//       "Apply Job Error:",
//       error
//     );

//     res.status(500).json({
//       success: false,
//       message: error.message,
//     });
//   }
// };

/* ==========================================
   Public Jobs
========================================== */
export const getJobs = async (
  req,
  res
) => {
  try {
    const jobs = await Job.find({
      isActive: true,
    }).sort({
      createdAt: -1,
    });

    res.status(200).json({
      success: true,
      jobs,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/* ==========================================
   Create Job (Admin)
========================================== */
export const createJob = async (req, res) => {
  try {
    const {
      title,
      department,
      location,
      type,
      salary,
      description,
      responsibilities,
      qualifications,
      benefits,
    } = req.body;

    const job = await Job.create({
      title,
      department,
      location,
      type,
      salary,
      description,
      responsibilities: responsibilities || [],
      qualifications: qualifications || [],
      benefits: benefits || [],
    });

    res.status(201).json({
      success: true,
      message: "Job created successfully.",
      job,
    });
  } catch (error) {
    console.error("Create Job Error:", error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/* ==========================================
   Get All Applications
========================================== */
export const getApplications =
  async (req, res) => {
    try {
      const applications =
        await Application.find()
          .populate(
            "job",
            "title department location type"
          )
          .sort({
            createdAt: -1,
          });

      res.status(200).json({
        success: true,
        count:
          applications.length,

        applications,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  };

/* ==========================================
   Get Single Application
========================================== */
export const getApplicationById =
  async (req, res) => {
    try {
      const application =
        await Application.findById(
          req.params.id
        ).populate("job");

      if (!application) {
        return res.status(404).json({
          success: false,
          message:
            "Application not found.",
        });
      }
      
      /* ==========================
       Email Content
    ========================== */

      res.status(200).json({
        success: true,
        application,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  };

/* ==========================================
   Update Application Status
========================================== */
export const updateApplicationStatus =
  async (req, res) => {
    try {
      const { status } = req.body;

      const allowedStatuses =
        [
          "Applied",
          "Under Review",
          "Interview",
          "Selected",
          "Rejected",
        ];

      if (
        !allowedStatuses.includes(
          status
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid status.",
        });
      }

      const application =
        await Application.findByIdAndUpdate(
          req.params.id,
          { status },
          { new: true }
        ).populate("job");

      if (!application) {
        return res.status(404).json({
          success: false,
          message:
            "Application not found.",
        });
      }

          let emailMessage = "";

    switch (status) {
      case "Applied":
        emailMessage =
          "Your application has been successfully received by our team.";
        break;

      case "Under Review":
        emailMessage =
          "Your application is currently under review by our hiring team.";
        break;

      case "Interview":
        emailMessage =
          "Congratulations! You have been shortlisted for the interview round. Our team will contact you shortly with further details.";
        break;

      case "Selected":
        emailMessage =
          "Congratulations! We are delighted to inform you that you have been selected to move forward with Zusko. Our team will contact you regarding the next steps.";
        break;

      case "Rejected":
        emailMessage =
          "Thank you for your interest in Zusko. After careful consideration, we regret to inform you that you have not been selected for this position. We encourage you to apply again in the future.";
        break;

      default:
        emailMessage =
          "Your application status has been updated.";
    }

    /* ==========================
       Send Status Email
    ========================== */

    try {
      const badgeColors = {
  Applied: ["#fff4ce", "#8a6d00"],
  "Under Review": ["#deecf9", "#005a9e"],
  Interview: ["#f3e8fd", "#6b21a8"],
  Selected: ["#dff6dd", "#107c10"],
  Rejected: ["#fde7e9", "#a4262c"],
};

const LOGO_URL = "https://www.zusko.in/assets/zusko-CuTZ8EeH.png"

const [bg, color] =
  badgeColors[status] || ["#f3f2f1", "#323130"];

      await sendEmail({
        
        to: application.email,

        subject: `Application Status Update – ${
          application.job?.title || "Zusko Careers"
        }`,

        html: `
<div style="background:#f3f2f1;padding:40px 20px;font-family:'Segoe UI',Arial,sans-serif;">

<table width="600" align="center" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);">

<tr>
<td style="padding:24px 32px;border-bottom:1px solid #e5e5e5;">
<img src="${LOGO_URL}" alt="Zusko" style="height:42px;">
</td>
</tr>

<tr>
<td style="padding:40px 32px;">

<h1 style="margin:0 0 24px;color:#323130;">
Application Status Update
</h1>

<p>
Hi <strong>${application.fullName}</strong>,
</p>

<p style="line-height:1.7;color:#605e5c;">
${emailMessage}
</p>

<table width="100%" style="background:#faf9f8;border:1px solid #edebe9;border-radius:10px;margin:30px 0;">
<tr>
<td style="padding:24px;">

<div style="font-size:13px;color:#605e5c;">
Position
</div>

<div style="font-size:18px;font-weight:600;color:#323130;margin-top:6px;">
${application.job?.title}
</div>

<div style="margin-top:20px;font-size:13px;color:#605e5c;">
Current Status
</div>

<div style="
display:inline-block;
background:${bg};
color:${color};
padding:8px 16px;
border-radius:999px;
margin-top:8px;
font-weight:600;
">
${status}
</div>

</td>
</tr>
</table>

${
  status === "Interview"
    ? `
<a href="https://www.zusko.in/career"
style="
display:inline-block;
background:#000;
color:#fff;
padding:12px 24px;
text-decoration:none;
border-radius:8px;
font-weight:600;
">
View Details
</a>
`
    : ""
}

${
  status === "Selected"
    ? `
<a href="https://www.zusko.in"
style="
display:inline-block;
background:#107c10;
color:#fff;
padding:12px 24px;
text-decoration:none;
border-radius:8px;
font-weight:600;
">
Next Steps
</a>
`
    : ""
}

</td>
</tr>

<tr>
<td style="background:#faf9f8;padding:24px 32px;border-top:1px solid #edebe9;">

<p style="margin:0;font-weight:600;color:#323130;">
Team Zusko
</p>

<p style="margin:10px 0;color:#605e5c;font-size:13px;">
Building the future of smart laundry experiences.
</p>

<p style="margin:0;color:#8a8886;font-size:12px;">
careers@zusko.in • www.zusko.in
</p>

<p style="margin-top:10px;color:#8a8886;font-size:12px;">
© ${new Date().getFullYear()} Zusko. All rights reserved.
</p>

</td>
</tr>

</table>

</div>
`,
      });

      console.log(
        `Status email sent to ${application.email}`
      );
    } catch (emailError) {
      console.error(
        "Status email failed:",
        emailError.message
      );

      // Status update rollback nahi hoga
    }

      res.status(200).json({
        success: true,
        message:
          "Status updated successfully.",
        application,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  };

/* ==========================================
   Delete Application
========================================== */
export const deleteApplication =
  async (req, res) => {
    try {
      const application =
        await Application.findById(
          req.params.id
        );

      if (!application) {
        return res.status(404).json({
          success: false,
          message:
            "Application not found.",
        });
      }

      await Application.findByIdAndDelete(
        req.params.id
      );

      res.status(200).json({
        success: true,
        message:
          "Application deleted successfully.",
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  };