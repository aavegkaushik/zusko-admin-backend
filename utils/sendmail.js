import nodemailer from "nodemailer";

export const sendEmail = async ({
  to,
  from,
  subject,
  html,
  attachments = []
}) => {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  console.log(
  "CUSTOMER SMTP PASS:",
  process.env.SMTP_PASS?.slice(-10)
);
  

  return transporter.sendMail({
    from: from || process.env.MAIL_FROM,
    to,
    subject,
    html,
    attachments
  });
};