// routes/auth.js (ESM)
import express from "express"
import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"
import auth from "../Middleware/auth.middleware.js"
import Vendor from "../Models/Vendor.js"

const router = express.Router()

// ------------------------------
// REGISTER
// ------------------------------
router.post("/register", async (req, res) => {
  try {
    const { name, email, password, role = "vendor" } = req.body

    if (!name || !email || !password) {
      return res.status(400).json({ message: "All fields are required" })
    }

    const exists = await Vendor.findOne({ email })
    if (exists) {
      return res.status(400).json({ message: "Email already exists" })
    }

    const hash = bcrypt.hashSync(password, 10)

    const user = await Vendor.create({
      name,
      email: email.toLowerCase().trim(),
      password: hash,
      role
    })

    return res.status(201).json({
      message: "Vendor registered successfully",
      vendor: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    })
  } catch (err) {
    console.error("Register Error:", err)
    return res.status(500).json({ message: "Server error" })
  }
})

// ------------------------------
// LOGIN
// ------------------------------
// improved login route with extra diagnostics
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    // basic validation
    if (!email || !password) {
      return res.status(400).json({ message: "Email & password required" });
    }

    // find user
    const user = await Vendor.findOne({ email }).lean();
    if (!user) {
      console.warn("[auth] login failed - user not found:", email);
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // ensure passwordHash field exists
    if (!user.password) {
      console.error("[auth] login failed - user has no passwordHash field", { email, userId: user._id });
      return res.status(500).json({ message: "Server error: user password not set" });
    }

    // compare password
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      console.warn("[auth] login failed - wrong password for:", email);
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // guard: ensure JWT secret exists
    if (!process.env.JWT_SECRET) {
      console.error("[auth] JWT secret is missing. Set process.env.JWT_SECRET");
      return res.status(500).json({ message: "Server misconfiguration: JWT secret missing" });
    }

    // Generate JWT
    const token = jwt.sign(
      {
        id: String(user._id),
        email: user.email,
        role: user.role || "vendor"
      },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    return res.json({
      message: "Login successful",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (err) {
    // log full stack to server console for debugging
    console.error("[auth] Login Error:", err && err.stack ? err.stack : err);
    return res.status(500).json({ message: "Server error" });
  }
});


//Logout Endpoint

router.post("/logout", (req, res) => {
  res.clearCookie("token")
  res.status(200).json({"Message": "Logout Successfully"})
})

export default router
