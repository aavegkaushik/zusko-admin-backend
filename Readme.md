# 🧺 Zusko Admin Backend

The **Zusko Admin Backend** is the central backend service powering the complete **Zusko Laundry Management System**.

It provides secure REST APIs for managing customers, business clients, vendors, careers, quotations, invoices, payments, analytics, and order operations.

Designed using **Node.js, Express.js, and MongoDB**, this backend serves multiple frontend applications including:

- 🌐 Zusko Customer Website
- 🛠️ Zusko Admin Dashboard
- 🏢 Business Quote Portal
- 📦 Vendor Management System

---

# 🚀 Features

## 🔐 Authentication

- Secure JWT Authentication
- Role-based authorization
- Vendor Login
- Admin Login
- Password encryption
- Protected APIs

---

## 📦 Order Management

- Create Orders
- Update Order Status
- Order Tracking
- Order History
- Pickup & Delivery Management
- Payment Status Management

---

## 🏢 Business (B2B) Module

- Business Lead Management
- Lead Status Pipeline
- Generate Professional Quotations
- Quote PDF Generator
- Quote Email Automation
- Quote Accept / Reject Portal
- Business CRM

---

## 👔 Careers Module

- Create Job Openings
- Career Listings
- Resume Upload
- Job Applications
- Applicant Management

---

## 💳 Payment Module

- Razorpay Integration
- Payment Verification
- Payment Status
- Online Payments

---

## 🧾 Invoice Module

- Dynamic Invoice Generation
- PDF Invoice Download
- Customer Invoice Email
- GST Ready Layout

---

## 📊 Analytics

- Daily Analytics
- Weekly Analytics
- Monthly Analytics
- Revenue Reports
- Vendor Statistics
- Business Insights

---

## 👕

Vendor Management

- Vendor Dashboard APIs
- Vendor Profile
- Vendor Statistics
- Vendor Earnings
- Assigned Orders

---

## ⚙️ Admin Settings

- Business Settings
- Profile Settings
- System Configuration

---

# 🚀 Tech Stack

## Backend

- Node.js
- Express.js
- MongoDB
- Mongoose

---

## Authentication

- JWT
- bcrypt

---

## Payments

- Razorpay

---

## Email

- Nodemailer
- SMTP

---

## PDF Generation

- PDFKit

---

## Security

- Helmet
- Express Rate Limit
- CORS

---

## Utilities

- DayJS
- Morgan
- dotenv

---

# 📁 Project Structure

```text
Backend/
│
├── Controllers/
├── Models/
├── Routes/
├── Middleware/
├── Utils/
├── Services/
├── uploads/
│   ├── resumes/
│   └── quotes/
│
├── server.js
├── package.json
├── .env.example
└── README.md
```

---

# 📡 API Modules

## Authentication

```
/api/auth
```

## Orders

```
/api/orders
```

## Analytics

```
/api/analytics
```

## Vendors

```
/api/vendors
```

## Invoices

```
/api/invoice
```

## Careers

```
/api/careers
```

## Payments

```
/api/payment
```

## Business Leads

```
/api/business-leads
```

## Business Quotes

```
/api/business-quotes
```

## Settings

```
/api/settings
```

---

# 🔒 Security Features

- JWT Authentication
- Helmet Security Headers
- Rate Limiting
- Secure Password Hashing
- Environment Variable Protection
- CORS Protection
- Input Validation

---

# 🌍 Deployment

Recommended Production Stack

- Ubuntu Server (AWS EC2)
- PM2
- Nginx
- MongoDB Atlas
- Cloudflare DNS
- GitHub Actions (Optional)

---

# ⚙️ Environment Variables

Create a `.env` file in the project root.

```env
PORT=

MONGO_URI=

JWT_SECRET=

SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
SMTP_FROM=

CLIENT_URL=
BUSINESS_URL=

RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
```

---

# 📦 Installation

```bash
git clone <repository>

cd backend

npm install

npm run dev
```

---

# 🏢 Zusko Ecosystem

- 🌐 Customer Website
- 🏢 Business Portal
- 🛠️ Admin Dashboard
- 🚚 Delivery Partner App *(Coming Soon)*
- 📱 Customer Mobile App *(Coming Soon)*

---

# © Zusko

**Built with ❤️ by Zusko Technologies**

Empowering modern laundry businesses with smart technology.