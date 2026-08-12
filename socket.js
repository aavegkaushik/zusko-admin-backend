// backend/socket.js

import { Server } from "socket.io";

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
     * Vendor/Admin joins their own room.
     *
     * Example:
     * vendor:USER_ID
     */
    socket.on("join_dashboard", ({ userId, role }) => {
      if (!userId) {
        console.warn("join_dashboard called without userId");
        return;
      }

      const room = `vendor:${userId}`;

      socket.join(room);

      console.log(
        `📡 ${role || "user"} joined dashboard room: ${room}`
      );

      socket.emit("dashboard_connected", {
        success: true,
        room,
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
 * Emit event to a specific vendor/admin room.
 */
export function emitToVendor(vendorId, event, data) {
  if (!io) {
    console.warn(
      "Socket.IO is not initialized. Event skipped:",
      event
    );
    return;
  }

  if (!vendorId) {
    console.warn(
      "emitToVendor called without vendorId:",
      event
    );
    return;
  }

  io.to(`vendor:${vendorId}`).emit(event, data);
}

/**
 * Emit event globally.
 */
export function emitGlobal(event, data) {
  if (!io) {
    console.warn(
      "Socket.IO is not initialized. Event skipped:",
      event
    );
    return;
  }

  io.emit(event, data);
}