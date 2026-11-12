// backend/socket.js

import { Server } from "socket.io";
import Order from "./Models/Order.js";

let io = null;

/**
 * Initialize Socket.IO
 */
export function initSocket(server) {
  io = new Server(server, {
    cors: {
      origin: [
        "http://localhost:5173",
        "http://localhost:5174",
        "https://zusko.in",
        "https://www.zusko.in",
        "https://admin.zusko.in",
        "https://business.zusko.in",
        "https://adminzusko.vercel.app",
      ],
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  io.on("connection", (socket) => {
    console.log("🔌 Dashboard connected:", socket.id);

    /**
     * Vendor/Admin joins dashboard rooms.
     */
    socket.on("join_dashboard", async (payload = {}) => {
      const { userId, role } = payload;

      // 1. Join user-specific vendor room
      if (userId) {
        socket.join(`vendor:${userId}`);
      }

      // 2. Join central admin & orders room
      socket.join("admin_dashboard");
      socket.join("orders");

      console.log(
        `📡 ${role || "operator"} connected to admin_dashboard (vendor:${userId || "central"})`
      );

      // 3. Send current pending unaccepted orders to newly connected client
      try {
        const pendingOrders = await Order.find({ status: "pending" })
          .sort({ createdAt: -1 })
          .limit(50)
          .lean();

        socket.emit("initial_pending_orders", {
          success: true,
          count: pendingOrders.length,
          orders: pendingOrders,
        });
      } catch (err) {
        console.warn("Could not fetch initial pending orders for socket:", err.message);
      }

      socket.emit("dashboard_connected", {
        success: true,
        room: userId ? `vendor:${userId}` : "admin_dashboard",
        adminRoom: "admin_dashboard",
      });
    });

    socket.on("disconnect", (reason) => {
      console.log(
        `🔌 Dashboard disconnected: ${socket.id}`,
        reason
      );
    });
  });

  return io;
}

/**
 * Get active Socket.IO instance
 */
export function getIO() {
  if (!io) {
    throw new Error(
      "Socket.IO has not been initialized. Call initSocket(server) first."
    );
  }

  return io;
}

/**
 * Emit event to a specific vendor room and all dashboard admins.
 */
export function emitToVendor(vendorId, event, data) {
  if (!io) {
    console.warn("Socket.IO is not initialized. Event skipped:", event);
    return;
  }

  // 1. Emit to specific vendor room
  if (vendorId) {
    io.to(`vendor:${vendorId}`).emit(event, data);
  }

  // 2. Broadcast to admin_dashboard room (all staff/store managers)
  io.to("admin_dashboard").emit(event, data);

  // 3. Emit hyphenated/underscored variants for event interoperability
  if (event === "new_order") {
    io.to("admin_dashboard").emit("new-order", data);
    if (vendorId) io.to(`vendor:${vendorId}`).emit("new-order", data);
  } else if (event === "new-order") {
    io.to("admin_dashboard").emit("new_order", data);
    if (vendorId) io.to(`vendor:${vendorId}`).emit("new_order", data);
  } else if (event === "order_accepted") {
    io.to("admin_dashboard").emit("order-accepted", data);
    if (vendorId) io.to(`vendor:${vendorId}`).emit("order-accepted", data);
  } else if (event === "order-accepted") {
    io.to("admin_dashboard").emit("order_accepted", data);
    if (vendorId) io.to(`vendor:${vendorId}`).emit("order_accepted", data);
  }
}

/**
 * Emit event globally.
 */
export function emitGlobal(event, data) {
  if (!io) {
    console.warn("Socket.IO is not initialized. Event skipped:", event);
    return;
  }

  io.emit(event, data);

  if (event === "new_order") {
    io.emit("new-order", data);
  } else if (event === "new-order") {
    io.emit("new_order", data);
  } else if (event === "order_accepted") {
    io.emit("order-accepted", data);
  } else if (event === "order-accepted") {
    io.emit("order_accepted", data);
  }
}