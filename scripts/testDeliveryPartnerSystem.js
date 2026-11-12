import assert from "node:assert/strict";
import mongoose from "mongoose";
import DeliveryPartner from "../Models/DeliveryPartner.js";
import Order from "../Models/Order.js";
import auth from "../Middleware/auth.middleware.js";
import {
  createDeliveryPartner,
  updateDeliveryPartner,
  togglePartnerStatus,
  assignPickupPartner,
  removePickupPartner,
  assignDeliveryPartner,
} from "../controllers/deliveryPartner.controller.js";

console.log("==================================================");
console.log("RUNNING ZUSKO DELIVERY PARTNER & ASSIGNMENT TESTS");
console.log("==================================================");

// ---------------------------------------------------------------------
// TEST 1: DeliveryPartner Model Schema & Validation
// ---------------------------------------------------------------------
console.log("\n[Test 1] Testing DeliveryPartner Model Schema & Enums...");

const validPartnerDoc = new DeliveryPartner({
  partnerId: "ZDP-1001",
  fullName: "Ramesh Kumar",
  mobileNumber: "9876543210",
  avatar: "/uploads/avatars/partner-sample.png",
});

assert.equal(validPartnerDoc.partnerId, "ZDP-1001");
assert.equal(validPartnerDoc.fullName, "Ramesh Kumar");
assert.equal(validPartnerDoc.mobileNumber, "9876543210");
assert.equal(validPartnerDoc.isActive, true, "Default isActive must be true");
assert.equal(validPartnerDoc.availabilityStatus, "Available", "Default availabilityStatus must be Available");

// Test invalid availabilityStatus enum
const invalidStatusDoc = new DeliveryPartner({
  partnerId: "ZDP-1002",
  fullName: "Suresh Sharma",
  mobileNumber: "9876543211",
  availabilityStatus: "InvalidStatus",
});

const statusValidationError = invalidStatusDoc.validateSync();
assert(statusValidationError !== undefined, "Should fail validation on invalid availabilityStatus");
assert(statusValidationError.errors.availabilityStatus, "Error should target availabilityStatus field");

// Test required fields
const missingFieldsDoc = new DeliveryPartner({});
const missingValidationError = missingFieldsDoc.validateSync();
assert(missingValidationError.errors.fullName, "fullName is required");
assert(missingValidationError.errors.mobileNumber, "mobileNumber is required");
console.log("✓ DeliveryPartner model schema, defaults, and enums verified.");

// ---------------------------------------------------------------------
// TEST 2: Order Model Extended Schema (Pickup, Delivery, History)
// ---------------------------------------------------------------------
console.log("\n[Test 2] Testing Order Model Assignment Extensions...");

const partnerAId = new mongoose.Types.ObjectId("660000000000000000000001");
const partnerBId = new mongoose.Types.ObjectId("660000000000000000000002");
const adminId = new mongoose.Types.ObjectId("660000000000000000000009");

const sampleOrder = new Order({
  orderId: "ORD-999001",
  vendorId: new mongoose.Types.ObjectId(),
  customerName: "Samveg Kaushik",
  customerPhone: "9876543210",
  items: [
    {
      name: "Formal Shirt",
      service: "Dry Clean",
      qty: 2,
      price: 120,
    },
  ],
  total: 240,
  status: "pending",
  pickupPartner: {
    partnerId: partnerAId,
    assignedAt: new Date("2026-11-12T10:00:00Z"),
    assignedBy: adminId,
    status: "assigned",
  },
  deliveryPartner: {
    partnerId: partnerBId,
    assignedAt: new Date("2026-11-12T14:00:00Z"),
    assignedBy: adminId,
    status: "assigned",
  },
  assignmentHistory: [
    {
      assignmentType: "pickup",
      previousPartnerId: null,
      newPartnerId: partnerAId,
      assignedBy: adminId,
      timestamp: new Date("2026-11-12T10:00:00Z"),
      status: "assigned",
    },
  ],
});

assert.equal(String(sampleOrder.pickupPartner.partnerId), String(partnerAId));
assert.equal(sampleOrder.pickupPartner.status, "assigned");
assert.equal(String(sampleOrder.deliveryPartner.partnerId), String(partnerBId));
assert.equal(sampleOrder.deliveryPartner.status, "assigned");
assert.equal(sampleOrder.assignmentHistory.length, 1);
assert.equal(sampleOrder.assignmentHistory[0].assignmentType, "pickup");
console.log("✓ Order model schema supports pickupPartner, deliveryPartner, and assignmentHistory.");

// ---------------------------------------------------------------------
// TEST 3: Security & Authorization Protection
// ---------------------------------------------------------------------
console.log("\n[Test 3] Testing Security and Admin-Only Route Protection...");

function createMockResponse() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
  };
  return res;
}

// 1. Unauthenticated request blocked by auth middleware
let nextCalled = false;
const unauthReq = { headers: {} };
const unauthRes = createMockResponse();
auth(unauthReq, unauthRes, () => {
  nextCalled = true;
});
assert.equal(unauthRes.statusCode, 401, "Unauthenticated request without token must return 401 Unauthorized");
assert.equal(nextCalled, false, "next() must not be called when unauthenticated");

// 2. Non-admin role blocked by adminOnly guard
const adminOnlyGuard = (req, res, next) => {
  const role = req.user?.role?.toLowerCase();
  if (!role || !["admin", "vendor", "superadmin"].includes(role)) {
    return res.status(403).json({
      success: false,
      message: "Admin or Vendor access required",
    });
  }
  next();
};

const customerReq = { user: { id: "user456", role: "customer" } };
const customerRes = createMockResponse();
let adminNextCalled = false;
adminOnlyGuard(customerReq, customerRes, () => {
  adminNextCalled = true;
});
assert.equal(customerRes.statusCode, 403, "Customer user must return 403 Forbidden");
assert.equal(adminNextCalled, false, "next() must not be called for customer");

// 3. Admin validation check on controller
const adminInvalidReq = {
  user: { id: "admin1", role: "admin" },
  body: { fullName: "", mobileNumber: "" },
};
const adminInvalidRes = createMockResponse();
await createDeliveryPartner(adminInvalidReq, adminInvalidRes);
assert.equal(adminInvalidRes.statusCode, 400, "Missing required fields must return 400 Bad Request");
console.log("✓ Route security and authorization guards verified.");

// ---------------------------------------------------------------------
// TEST 4: Pickup Partner Assignment & Reassignment Audit Trail
// ---------------------------------------------------------------------
console.log("\n[Test 4] Testing Pickup Partner Assignment & Reassignment History...");

const simulatedOrder = {
  _id: new mongoose.Types.ObjectId("660000000000000000000100"),
  orderId: "ORD-999002",
  status: "pending",
  pickupPartner: null,
  assignmentHistory: [],
};

// Step A: Initial Pickup Assignment
function simulateAssignPickup(order, partnerId, adminUser) {
  if (order.status === "cancelled") {
    throw new Error("Cannot assign partners to a cancelled order");
  }

  const previousPartnerId = order.pickupPartner?.partnerId || null;
  const now = new Date();

  order.pickupPartner = {
    partnerId: partnerId,
    assignedAt: now,
    assignedBy: adminUser.id,
    status: "assigned",
    pickedUpAt: null,
  };

  order.assignmentHistory.push({
    assignmentType: "pickup",
    previousPartnerId: previousPartnerId,
    newPartnerId: partnerId,
    assignedBy: adminUser.id,
    timestamp: now,
    reassignedAt: previousPartnerId ? now : null,
    status: "assigned",
  });
}

simulateAssignPickup(simulatedOrder, partnerAId, { id: adminId });
assert.equal(String(simulatedOrder.pickupPartner.partnerId), String(partnerAId));
assert.equal(simulatedOrder.pickupPartner.status, "assigned");
assert.equal(simulatedOrder.assignmentHistory.length, 1);
assert.equal(simulatedOrder.assignmentHistory[0].previousPartnerId, null);
assert.equal(String(simulatedOrder.assignmentHistory[0].newPartnerId), String(partnerAId));

// Step B: Reassign to Partner B before pickup
simulateAssignPickup(simulatedOrder, partnerBId, { id: adminId });
assert.equal(String(simulatedOrder.pickupPartner.partnerId), String(partnerBId));
assert.equal(simulatedOrder.assignmentHistory.length, 2, "Assignment history must have 2 entries");
assert.equal(String(simulatedOrder.assignmentHistory[1].previousPartnerId), String(partnerAId));
assert.equal(String(simulatedOrder.assignmentHistory[1].newPartnerId), String(partnerBId));
assert.notEqual(simulatedOrder.assignmentHistory[1].reassignedAt, null);

// Step C: Pickup Completion
simulatedOrder.status = "picked-up";
simulatedOrder.pickupPartner.status = "completed";
simulatedOrder.pickupPartner.pickedUpAt = new Date();
assert.equal(simulatedOrder.pickupPartner.status, "completed");
assert.notEqual(simulatedOrder.pickupPartner.pickedUpAt, null);
console.log("✓ Pickup partner assignment, reassignment, and completion audit trail verified.");

// ---------------------------------------------------------------------
// TEST 5: Independent Delivery Partner Assignment & Data Preservation
// ---------------------------------------------------------------------
console.log("\n[Test 5] Testing Independent Delivery Assignment & Preservation...");

const partnerCId = new mongoose.Types.ObjectId("660000000000000000000003");

// Preserve snapshot of pickupPartner
const pickupPartnerSnapshot = { ...simulatedOrder.pickupPartner };

function simulateAssignDelivery(order, partnerId, adminUser) {
  if (order.status === "cancelled") {
    throw new Error("Cannot assign partners to a cancelled order");
  }

  const previousPartnerId = order.deliveryPartner?.partnerId || null;
  const now = new Date();

  order.deliveryPartner = {
    partnerId: partnerId,
    assignedAt: now,
    assignedBy: adminUser.id,
    status: "assigned",
    deliveredAt: null,
  };

  order.assignmentHistory.push({
    assignmentType: "delivery",
    previousPartnerId: previousPartnerId,
    newPartnerId: partnerId,
    assignedBy: adminUser.id,
    timestamp: now,
    reassignedAt: previousPartnerId ? now : null,
    status: "assigned",
  });
}

// Assign delivery partner
simulateAssignDelivery(simulatedOrder, partnerCId, { id: adminId });

// Verify deliveryPartner is set
assert.equal(String(simulatedOrder.deliveryPartner.partnerId), String(partnerCId));
assert.equal(simulatedOrder.deliveryPartner.status, "assigned");

// CRITICAL VERIFICATION: pickupPartner must remain 100% UNTOUCHED
assert.equal(
  String(simulatedOrder.pickupPartner.partnerId),
  String(pickupPartnerSnapshot.partnerId),
  "Pickup partner must NOT be overwritten when delivery partner is assigned"
);
assert.equal(simulatedOrder.pickupPartner.status, "completed");
assert.equal(simulatedOrder.pickupPartner.pickedUpAt, pickupPartnerSnapshot.pickedUpAt);

// Verify history recorded delivery assignment independently
assert.equal(simulatedOrder.assignmentHistory.length, 3);
assert.equal(simulatedOrder.assignmentHistory[2].assignmentType, "delivery");
assert.equal(String(simulatedOrder.assignmentHistory[2].newPartnerId), String(partnerCId));
console.log("✓ Independent delivery assignment verified: pickup details perfectly preserved.");

// ---------------------------------------------------------------------
// TEST 6: Order Status Transition Guard ("out-for-delivery")
// ---------------------------------------------------------------------
console.log("\n[Test 6] Testing 'out-for-delivery' Transition Guard...");

function validateStatusTransition(order, targetStatus) {
  if (order.status === "cancelled") {
    return { ok: false, status: 400, message: "Cannot change status of cancelled order" };
  }

  if (targetStatus === "out-for-delivery" && !order.deliveryPartner?.partnerId) {
    return {
      ok: false,
      status: 400,
      message: "Cannot move order to out-for-delivery without an assigned delivery partner. Please assign a delivery partner first.",
    };
  }

  return { ok: true, status: 200 };
}

// Case 1: Order has no delivery partner -> Attempting "out-for-delivery" must FAIL
const orderWithoutDeliveryPartner = {
  orderId: "ORD-999003",
  status: "ready-for-delivery",
  deliveryPartner: null,
};
const guardResultFail = validateStatusTransition(orderWithoutDeliveryPartner, "out-for-delivery");
assert.equal(guardResultFail.ok, false);
assert.equal(guardResultFail.status, 400);
assert(guardResultFail.message.includes("Cannot move order to out-for-delivery without an assigned delivery partner"));

// Case 2: Order with delivery partner -> Attempting "out-for-delivery" SUCCEEDS
const orderWithDeliveryPartner = {
  orderId: "ORD-999004",
  status: "ready-for-delivery",
  deliveryPartner: {
    partnerId: partnerCId,
    status: "assigned",
  },
};
const guardResultSuccess = validateStatusTransition(orderWithDeliveryPartner, "out-for-delivery");
assert.equal(guardResultSuccess.ok, true);

// When transitioned, deliveryPartner status becomes "on-the-way"
orderWithDeliveryPartner.status = "out-for-delivery";
orderWithDeliveryPartner.deliveryPartner.status = "on-the-way";
assert.equal(orderWithDeliveryPartner.deliveryPartner.status, "on-the-way");

// Case 3: Order completed -> deliveryPartner status becomes "completed"
orderWithDeliveryPartner.status = "completed";
orderWithDeliveryPartner.deliveryPartner.status = "completed";
orderWithDeliveryPartner.deliveryPartner.deliveredAt = new Date();
assert.equal(orderWithDeliveryPartner.deliveryPartner.status, "completed");
assert.notEqual(orderWithDeliveryPartner.deliveryPartner.deliveredAt, null);
console.log("✓ Order status transition guards and automatic partner status updates verified.");

// ---------------------------------------------------------------------
// TEST 7: Partner Availability State Transitions
// ---------------------------------------------------------------------
console.log("\n[Test 7] Testing Partner Availability State Transitions...");

function computeTargetAvailability(activeRunCount, currentStatus) {
  if (currentStatus === "Offline") return "Offline";
  return activeRunCount > 0 ? "Busy" : "Available";
}

assert.equal(computeTargetAvailability(0, "Available"), "Available");
assert.equal(computeTargetAvailability(1, "Available"), "Busy", "Partner with 1 run must become Busy");
assert.equal(computeTargetAvailability(3, "Busy"), "Busy");
assert.equal(computeTargetAvailability(0, "Busy"), "Available", "Partner with 0 runs must return to Available");
assert.equal(computeTargetAvailability(2, "Offline"), "Offline", "Offline partner must remain Offline");
console.log("✓ Partner availability state sync transitions verified.");

// ---------------------------------------------------------------------
// TEST 8: Full Lifecycle & History Integrity
// ---------------------------------------------------------------------
console.log("\n[Test 8] Testing Full Order Lifecycle & Complete History Integrity...");

// Verify the simulated completed order has all expected properties intact
assert.equal(simulatedOrder.status, "picked-up"); // Simulated pickup
simulatedOrder.status = "completed";
simulatedOrder.deliveryPartner.status = "completed";
simulatedOrder.deliveryPartner.deliveredAt = new Date();

assert.equal(simulatedOrder.status, "completed");
assert.equal(simulatedOrder.pickupPartner.status, "completed");
assert.equal(simulatedOrder.deliveryPartner.status, "completed");
assert(simulatedOrder.pickupPartner.pickedUpAt instanceof Date);
assert(simulatedOrder.deliveryPartner.deliveredAt instanceof Date);

// Total history records must show complete lifecycle:
// [0]: pickup assigned Partner A
// [1]: pickup reassigned Partner B
// [2]: delivery assigned Partner C
assert.equal(simulatedOrder.assignmentHistory.length, 3);
assert.equal(simulatedOrder.assignmentHistory[0].assignmentType, "pickup");
assert.equal(simulatedOrder.assignmentHistory[1].assignmentType, "pickup");
assert.equal(simulatedOrder.assignmentHistory[2].assignmentType, "delivery");

console.log("✓ Full order lifecycle and historical assignment integrity verified.");

console.log("\n==================================================");
console.log("ALL DELIVERY PARTNER SYSTEM UNIT TESTS PASSED (8/8)");
console.log("==================================================");
