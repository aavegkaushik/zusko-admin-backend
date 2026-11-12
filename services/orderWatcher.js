// backend/services/orderWatcher.js

import Order from "../Models/Order.js";
import { emitToVendor, emitGlobal } from "../socket.js";
import { invalidateOrderCache } from "./cache.service.js";

let watcherActive = false;
let pollingIntervalId = null;
let changeStream = null;

// Track active pending orders to prevent duplicate alerts
const knownPendingOrders = new Map(); // orderId -> lastStatus

/**
 * Start the real-time order watcher.
 * Combines MongoDB Change Streams (for replica-set environments / Atlas)
 * with a resilient polling fallback (for standalone local development).
 */
export async function startOrderWatcher() {
  if (watcherActive) {
    console.log("ℹ️ Order watcher already active");
    return;
  }

  watcherActive = true;
  console.log("🔍 Starting real-time order watcher...");

  // 1. Initial snapshot of current pending orders
  try {
    const existingPending = await Order.find({ status: "pending" })
      .select("_id orderId status customerName total createdAt vendorId")
      .lean();

    existingPending.forEach((o) => {
      knownPendingOrders.set(String(o._id), o.status);
    });

    console.log(`📦 Order watcher initialized with ${knownPendingOrders.size} active pending orders`);
  } catch (err) {
    console.warn("⚠️ Failed to load initial pending orders in watcher:", err.message);
  }

  // 2. Setup MongoDB Change Stream (Instant push on MongoDB replica set)
  setupChangeStream();

  // 3. Setup resilient background polling (every 3.5s) to guarantee detection
  // across cross-process writes (e.g. Zusko Server direct MongoDB inserts)
  setupPollingWatcher();
}

/**
 * Setup MongoDB Change Stream
 */
function setupChangeStream() {
  try {
    changeStream = Order.watch(
      [
        {
          $match: {
            operationType: { $in: ["insert", "update", "replace"] },
          },
        },
      ],
      { fullDocument: "updateLookup" }
    );

    changeStream.on("change", (change) => {
      handleDatabaseChange(change);
    });

    changeStream.on("error", (err) => {
      console.warn("⚠️ MongoDB Change Stream not supported or errored (fallback active):", err.message);
      if (changeStream) {
        try {
          changeStream.close();
        } catch {}
        changeStream = null;
      }
    });

    console.log("📡 MongoDB Change Stream attached for real-time order detection");
  } catch (err) {
    console.warn("⚠️ MongoDB Change Stream could not be initialized (using polling fallback):", err.message);
  }
}

/**
 * Process a Change Stream event
 */
function handleDatabaseChange(change) {
  try {
    const doc = change.fullDocument;
    if (!doc || !doc._id) return;

    const orderId = String(doc._id);

    if (change.operationType === "insert") {
      if (doc.status === "pending") {
        if (!knownPendingOrders.has(orderId)) {
          knownPendingOrders.set(orderId, "pending");
          console.log(`🔔 [ChangeStream] New pending order detected: ${orderId} (${doc.orderId || "N/A"})`);
          emitToVendor(doc.vendorId, "new_order", {
            order: doc,
            orderId: doc._id,
          });
          invalidateOrderCache(orderId, doc.vendorId).catch(() => {});
        }
      }
    } else if (change.operationType === "update" || change.operationType === "replace") {
      const prevStatus = knownPendingOrders.get(orderId);
      const newStatus = doc.status;

      if (prevStatus === "pending" && newStatus && newStatus !== "pending") {
        knownPendingOrders.delete(orderId);
        console.log(`🔕 [ChangeStream] Order ${orderId} moved from pending -> ${newStatus}`);

        emitGlobal("order_status_updated", {
          orderId,
          order: doc,
          status: newStatus,
          updatedAt: doc.updatedAt || new Date(),
          isPending: false,
        });

        if (newStatus === "accepted") {
          emitGlobal("order_accepted", {
            orderId,
            acceptedAt: doc.acceptedAt || new Date(),
            status: "accepted",
          });
        }

        invalidateOrderCache(orderId, doc.vendorId).catch(() => {});
      } else if (newStatus === "pending") {
        knownPendingOrders.set(orderId, "pending");
      }
    }
  } catch (err) {
    console.error("Error processing Change Stream event:", err);
  }
}

/**
 * Resilient polling fallback: queries DB every 3.5 seconds
 * Checks for any new pending order inserted outside this server process (e.g. Zusko Server).
 */
function setupPollingWatcher() {
  if (pollingIntervalId) clearInterval(pollingIntervalId);

  pollingIntervalId = setInterval(async () => {
    try {
      const currentPending = await Order.find({ status: "pending" })
        .sort({ createdAt: -1 })
        .limit(50)
        .lean();

      const currentIds = new Set();

      for (const order of currentPending) {
        const id = String(order._id);
        currentIds.add(id);

        if (!knownPendingOrders.has(id)) {
          // Brand new pending order detected!
          knownPendingOrders.set(id, "pending");
          console.log(`🔔 [Polling Watcher] New pending order detected: ${id} (${order.orderId || "N/A"})`);

          emitToVendor(order.vendorId, "new_order", {
            order,
            orderId: order._id,
          });
          invalidateOrderCache(order._id, order.vendorId).catch(() => {});
        }
      }

      // Check if any previously known pending order is no longer in currentPending
      for (const [id] of knownPendingOrders.entries()) {
        if (!currentIds.has(id)) {
          // Check what its actual status in DB is
          try {
            const updatedDoc = await Order.findById(id).select("status acceptedAt updatedAt").lean();
            if (!updatedDoc || updatedDoc.status !== "pending") {
              knownPendingOrders.delete(id);
              const status = updatedDoc ? updatedDoc.status : "removed";
              console.log(`🔕 [Polling Watcher] Order ${id} is no longer pending (${status})`);

              emitGlobal("order_status_updated", {
                orderId: id,
                status,
                updatedAt: updatedDoc?.updatedAt || new Date(),
                isPending: false,
              });

              if (status === "accepted") {
                emitGlobal("order_accepted", {
                  orderId: id,
                  acceptedAt: updatedDoc?.acceptedAt || new Date(),
                  status: "accepted",
                });
              }

              invalidateOrderCache(id, updatedDoc?.vendorId).catch(() => {});
            }
          } catch {}
        }
      }
    } catch (err) {
      // Quiet fail during temporary network or DB disconnection
    }
  }, 3500);

  if (pollingIntervalId.unref) {
    pollingIntervalId.unref();
  }
}

/**
 * Stop order watcher (e.g. during server shutdown)
 */
export function stopOrderWatcher() {
  watcherActive = false;
  if (pollingIntervalId) {
    clearInterval(pollingIntervalId);
    pollingIntervalId = null;
  }
  if (changeStream) {
    try {
      changeStream.close();
    } catch {}
    changeStream = null;
  }
  console.log("🛑 Order watcher stopped");
}

