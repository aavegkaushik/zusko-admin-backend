// middleware/auth.js (ESM)
import jwt from "jsonwebtoken"

export default function auth(req, res, next) {
  try {
    const header = req.headers.authorization

    if (!header) {
      return res.status(401).json({ message: "No token provided" })
    }

    // Expected format: "Bearer token"
    const token = header.split(" ")[1]

    if (!token) {
      return res.status(401).json({ message: "Authentication token missing" })
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET)

    // Attach decoded user details to request
    req.user = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role
    }

    next()
  } catch (err) {
    console.error("Auth Middleware Error:", err.message)

    // Token expired
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Token expired, please login again" })
    }

    // Invalid
    return res.status(401).json({ message: "Invalid token" })
  }
}
