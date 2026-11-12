import mongoose from "mongoose";
import DeliveryPartner from "../Models/DeliveryPartner.js";
import Order from "../Models/Order.js";
import { emitToVendor } from "../socket.js";
import {
  invalidateOrderCache,
  deleteCache,
  CacheKeys,
} from "../services/cache.service.js";

// =========================================================
// HELPER: SYNC PARTNER AVAILABILITY
// =========================================================
export async function syncPartnerAvailability(partnerId) {
  if (!partnerId) return;

  try {
    const partner = await DeliveryPartner.findById(partnerId);
    if (!partner) return;

    // If partner is manually marked Offline, do not force them back to Available/Busy
    if (partner.availabilityStatus === "Offline") return;

    // Count non-completed, non-cancelled assignments where partner is assigned or on-the-way
    const activeAssignments = await Order.countDocuments({
      status: { $nin: ["completed", "cancelled"] },
      $or: [
        {
          "pickupPartner.partnerId": partnerId,
          "pickupPartner.status": { $in: ["assigned", "on-the-way"] },
          status: { $nin: ["picked-up", "in-progress", "ready-for-delivery", "out-for-delivery"] },
        },
        {
          "deliveryPartner.partnerId": partnerId,
          "deliveryPartner.status": { $in: ["assigned", "on-the-way"] },
        },
      ],
    });

    const targetStatus = activeAssignments > 0 ? "Busy" : "Available";

    if (partner.availabilityStatus !== targetStatus) {
      partner.availabilityStatus = targetStatus;
      await partner.save();
    }
  } catch (err) {
    console.error("Error in syncPartnerAvailability:", err);
  }
}

// =========================================================
// GET ALL DELIVERY PARTNERS
// GET /api/delivery-partners
// =========================================================
export async function getDeliveryPartners(req, res) {
  try {
    const { search = "", availabilityStatus = "all", isActive = "all" } = req.query;

    const filter = {};

    if (isActive !== "all") {
      filter.isActive = isActive === "true";
    }

    if (availabilityStatus !== "all" && ["Available", "Busy", "Offline"].includes(availabilityStatus)) {
      filter.availabilityStatus = availabilityStatus;
    }

    if (search.trim()) {
      const q = search.trim();
      filter.$or = [
        { fullName: { $regex: q, $options: "i" } },
        { mobileNumber: { $regex: q, $options: "i" } },
        { partnerId: { $regex: q, $options: "i" } },
      ];
    }

    const partners = await DeliveryPartner.find(filter)
      .sort({ createdAt: -1 })
      .lean();

    // Enrich each partner with their active assignment count
    const enrichedPartners = await Promise.all(
      partners.map(async (partner) => {
        const activeCount = await Order.countDocuments({
          status: { $nin: ["completed", "cancelled"] },
          $or: [
            {
              "pickupPartner.partnerId": partner._id,
              "pickupPartner.status": { $in: ["assigned", "on-the-way"] },
              status: { $nin: ["picked-up", "in-progress", "ready-for-delivery", "out-for-delivery"] },
            },
            {
              "deliveryPartner.partnerId": partner._id,
              "deliveryPartner.status": { $in: ["assigned", "on-the-way"] },
            },
          ],
        });

        return {
          ...partner,
          activeAssignmentsCount: activeCount,
        };
      })
    );

    // Compute stats summary
    const [totalPartners, availableCount, busyCount, offlineCount] = await Promise.all([
      DeliveryPartner.countDocuments(),
      DeliveryPartner.countDocuments({ isActive: true, availabilityStatus: "Available" }),
      DeliveryPartner.countDocuments({ isActive: true, availabilityStatus: "Busy" }),
      DeliveryPartner.countDocuments({ $or: [{ isActive: false }, { availabilityStatus: "Offline" }] }),
    ]);

    return res.json({
      success: true,
      count: enrichedPartners.length,
      stats: {
        total: totalPartners,
        available: availableCount,
        busy: busyCount,
        offline: offlineCount,
      },
      data: enrichedPartners,
    });
  } catch (error) {
    console.error("GET delivery partners error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch delivery partners",
      error: error.message,
    });
  }
}

// =========================================================
// GET SINGLE DELIVERY PARTNER
// GET /api/delivery-partners/:id
// =========================================================
export async function getDeliveryPartnerById(req, res) {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid partner ID",
      });
    }

    const partner = await DeliveryPartner.findById(id).lean();

    if (!partner) {
      return res.status(404).json({
        success: false,
        message: "Delivery partner not found",
      });
    }

    // Fetch active assignments for this partner
    const activeAssignments = await Order.find({
      status: { $nin: ["completed", "cancelled"] },
      $or: [
        { "pickupPartner.partnerId": partner._id },
        { "deliveryPartner.partnerId": partner._id },
      ],
    })
      .select("orderId customerName customerPhone address status pickup delivery pickupPartner deliveryPartner createdAt")
      .sort({ updatedAt: -1 })
      .lean();

    return res.json({
      success: true,
      data: {
        ...partner,
        activeAssignments,
      },
    });
  } catch (error) {
    console.error("GET delivery partner by id error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch delivery partner details",
      error: error.message,
    });
  }
}

// =========================================================
// CREATE DELIVERY PARTNER
// POST /api/delivery-partners
// =========================================================
export async function createDeliveryPartner(req, res) {
  try {
    const { fullName, mobileNumber, avatar, availabilityStatus = "Available" } = req.body;

    if (!fullName || !fullName.trim()) {
      return res.status(400).json({
        success: false,
        message: "Full name is required",
      });
    }

    if (!mobileNumber || !mobileNumber.trim()) {
      return res.status(400).json({
        success: false,
        message: "Mobile number is required",
      });
    }

    const cleanedPhone = mobileNumber.trim().replace(/\s+/g, "");

    // Check for existing active partner with the same mobile number
    const existing = await DeliveryPartner.findOne({
      mobileNumber: cleanedPhone,
      isActive: true,
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        message: `A delivery partner with mobile number ${cleanedPhone} already exists (${existing.fullName})`,
      });
    }

    let finalAvatar = avatar || "";
    if (req.file) {
      finalAvatar = `/uploads/avatars/${req.file.filename}`;
    }

    const partner = new DeliveryPartner({
      fullName: fullName.trim(),
      mobileNumber: cleanedPhone,
      avatar: finalAvatar,
      availabilityStatus: ["Available", "Busy", "Offline"].includes(availabilityStatus)
        ? availabilityStatus
        : "Available",
      isActive: true,
    });

    await partner.save();

    return res.status(201).json({
      success: true,
      message: "Delivery partner created successfully",
      data: partner,
    });
  } catch (error) {
    console.error("CREATE delivery partner error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create delivery partner",
      error: error.message,
    });
  }
}

// =========================================================
// UPDATE DELIVERY PARTNER
// PUT /api/delivery-partners/:id
// =========================================================
export async function updateDeliveryPartner(req, res) {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid partner ID",
      });
    }

    const partner = await DeliveryPartner.findById(id);

    if (!partner) {
      return res.status(404).json({
        success: false,
        message: "Delivery partner not found",
      });
    }

    const { fullName, mobileNumber, avatar, availabilityStatus, isActive } = req.body;

    if (fullName !== undefined) {
      if (!fullName.trim()) {
        return res.status(400).json({
          success: false,
          message: "Full name cannot be empty",
        });
      }
      partner.fullName = fullName.trim();
    }

    if (mobileNumber !== undefined) {
      const cleaned = mobileNumber.trim().replace(/\s+/g, "");
      if (!cleaned) {
        return res.status(400).json({
          success: false,
          message: "Mobile number cannot be empty",
        });
      }

      // Check if duplicate with another partner
      const duplicate = await DeliveryPartner.findOne({
        _id: { $ne: partner._id },
        mobileNumber: cleaned,
        isActive: true,
      });

      if (duplicate) {
        return res.status(409).json({
          success: false,
          message: `Another delivery partner with mobile number ${cleaned} already exists (${duplicate.fullName})`,
        });
      }

      partner.mobileNumber = cleaned;
    }

    if (req.file) {
      partner.avatar = `/uploads/avatars/${req.file.filename}`;
    } else if (avatar !== undefined) {
      partner.avatar = String(avatar || "").trim();
    }

    if (availabilityStatus !== undefined && ["Available", "Busy", "Offline"].includes(availabilityStatus)) {
      partner.availabilityStatus = availabilityStatus;
    }

    if (isActive !== undefined) {
      partner.isActive = isActive === true || isActive === "true";
      if (!partner.isActive) {
        partner.availabilityStatus = "Offline";
      }
    }

    await partner.save();
    await syncPartnerAvailability(partner._id);

    return res.json({
      success: true,
      message: "Delivery partner updated successfully",
      data: partner,
    });
  } catch (error) {
    console.error("UPDATE delivery partner error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update delivery partner",
      error: error.message,
    });
  }
}

// =========================================================
// TOGGLE STATUS
// PATCH /api/delivery-partners/:id/status
// =========================================================
export async function togglePartnerStatus(req, res) {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid partner ID",
      });
    }

    const partner = await DeliveryPartner.findById(id);

    if (!partner) {
      return res.status(404).json({
        success: false,
        message: "Delivery partner not found",
      });
    }

    const { availabilityStatus } = req.body;

    if (availabilityStatus && ["Available", "Busy", "Offline"].includes(availabilityStatus)) {
      partner.availabilityStatus = availabilityStatus;
    } else {
      partner.isActive = !partner.isActive;
      if (!partner.isActive) {
        partner.availabilityStatus = "Offline";
      } else {
        partner.availabilityStatus = "Available";
      }
    }

    await partner.save();
    await syncPartnerAvailability(partner._id);

    return res.json({
      success: true,
      message: `Partner status updated to ${partner.isActive ? "Active" : "Inactive"} (${partner.availabilityStatus})`,
      data: partner,
    });
  } catch (error) {
    console.error("TOGGLE delivery partner status error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to toggle delivery partner status",
      error: error.message,
    });
  }
}

// =========================================================
// DELETE DELIVERY PARTNER
// DELETE /api/delivery-partners/:id
// =========================================================
export async function deleteDeliveryPartner(req, res) {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid partner ID",
      });
    }

    const partner = await DeliveryPartner.findById(id);

    if (!partner) {
      return res.status(404).json({
        success: false,
        message: "Delivery partner not found",
      });
    }

    // Safety check: ensure no active assignments
    const activeCount = await Order.countDocuments({
      status: { $nin: ["completed", "cancelled"] },
      $or: [
        {
          "pickupPartner.partnerId": partner._id,
          "pickupPartner.status": { $in: ["assigned", "on-the-way"] },
        },
        {
          "deliveryPartner.partnerId": partner._id,
          "deliveryPartner.status": { $in: ["assigned", "on-the-way"] },
        },
      ],
    });

    if (activeCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete partner. ${partner.fullName} currently has ${activeCount} active order assignment(s). Please reassign or complete those tasks first.`,
      });
    }

    await DeliveryPartner.findByIdAndDelete(id);

    return res.json({
      success: true,
      message: "Delivery partner deleted safely",
      data: partner,
    });
  } catch (error) {
    console.error("DELETE delivery partner error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete delivery partner",
      error: error.message,
    });
  }
}

// =========================================================
// ASSIGN PICKUP PARTNER
// POST /api/orders/:orderId/assign-pickup-partner
// =========================================================
export async function assignPickupPartner(req, res) {
  try {
    const { orderId } = req.params;
    const { partnerId, note = "" } = req.body;

    if (!partnerId || !mongoose.Types.ObjectId.isValid(partnerId)) {
      return res.status(400).json({
        success: false,
        message: "A valid partner ID is required",
      });
    }

    const orderQuery = mongoose.Types.ObjectId.isValid(orderId)
      ? { $or: [{ _id: orderId }, { orderId: orderId }] }
      : { orderId: orderId };

    const order = await Order.findOne(orderQuery);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Validation rules
    if (order.status === "cancelled") {
      return res.status(400).json({
        success: false,
        message: "Cannot assign delivery partner to a cancelled order",
      });
    }

    if (["picked-up", "in-progress", "ready-for-delivery", "out-for-delivery", "completed"].includes(order.status)) {
      return res.status(400).json({
        success: false,
        message: "Pickup has already been completed for this order. Reassignment is not allowed.",
      });
    }

    const partner = await DeliveryPartner.findById(partnerId);

    if (!partner) {
      return res.status(404).json({
        success: false,
        message: "Delivery partner not found",
      });
    }

    if (!partner.isActive) {
      return res.status(400).json({
        success: false,
        message: "Cannot assign an inactive delivery partner",
      });
    }

    if (partner.availabilityStatus === "Offline") {
      return res.status(400).json({
        success: false,
        message: "Cannot assign an offline delivery partner",
      });
    }

    const oldPartnerId = order.pickupPartner?.partnerId || null;
    const isReassignment = oldPartnerId && String(oldPartnerId) !== String(partner._id);
    const assignedByVal = (req.user?.id && mongoose.Types.ObjectId.isValid(req.user.id))
      ? new mongoose.Types.ObjectId(req.user.id)
      : null;

    const historyEntry = {
      assignmentType: "pickup",
      previousPartnerId: oldPartnerId,
      partnerId: partner._id,
      assignedBy: assignedByVal,
      assignedAt: new Date(),
      status: "assigned",
      note: note || (isReassignment ? "Pickup partner reassigned" : "Pickup partner assigned"),
    };

    await Order.findByIdAndUpdate(
      order._id,
      {
        $set: {
          pickupPartner: {
            partnerId: partner._id,
            assignedAt: new Date(),
            assignedBy: assignedByVal,
            status: "assigned",
            pickedUpAt: null,
          },
          updatedAt: new Date(),
        },
        $push: {
          assignmentHistory: historyEntry,
        },
      },
      { new: true, runValidators: false }
    );

    // Sync availability
    await syncPartnerAvailability(partner._id);
    if (oldPartnerId && String(oldPartnerId) !== String(partner._id)) {
      await syncPartnerAvailability(oldPartnerId);
    }

    // Populate order for response
    const populatedOrder = await Order.findById(order._id)
      .populate("pickupPartner.partnerId", "partnerId fullName mobileNumber avatar availabilityStatus isActive")
      .populate("deliveryPartner.partnerId", "partnerId fullName mobileNumber avatar availabilityStatus isActive")
      .populate("assignmentHistory.partnerId", "partnerId fullName mobileNumber avatar")
      .populate("assignmentHistory.previousPartnerId", "partnerId fullName mobileNumber avatar")
      .populate("assignmentHistory.assignedBy", "name email")
      .lean();

    if (order.vendorId) {
      emitToVendor(order.vendorId, "order_pickup_assigned", {
        orderId: order._id,
        pickupPartner: populatedOrder.pickupPartner,
      });
    }

    await invalidateOrderCache(order._id, order.vendorId);

    return res.json({
      success: true,
      message: isReassignment
        ? `Pickup partner reassigned to ${partner.fullName}`
        : `Pickup partner ${partner.fullName} assigned successfully`,
      data: populatedOrder,
    });
  } catch (error) {
    console.error("ASSIGN pickup partner error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to assign pickup partner",
      error: error.message,
    });
  }
}

// =========================================================
// REMOVE PICKUP PARTNER ASSIGNMENT
// DELETE /api/orders/:orderId/pickup-partner
// =========================================================
export async function removePickupPartner(req, res) {
  try {
    const { orderId } = req.params;

    const orderQuery = mongoose.Types.ObjectId.isValid(orderId)
      ? { $or: [{ _id: orderId }, { orderId: orderId }] }
      : { orderId: orderId };

    const order = await Order.findOne(orderQuery);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    if (!order.pickupPartner?.partnerId) {
      return res.status(400).json({
        success: false,
        message: "No pickup partner assigned to this order",
      });
    }

    if (order.pickupPartner.status === "completed" || ["picked-up", "in-progress", "completed"].includes(order.status)) {
      return res.status(400).json({
        success: false,
        message: "Pickup has already been completed; assignment cannot be removed",
      });
    }

    const previousPartnerId = order.pickupPartner.partnerId;
    const assignedByVal = (req.user?.id && mongoose.Types.ObjectId.isValid(req.user.id))
      ? new mongoose.Types.ObjectId(req.user.id)
      : null;

    const historyEntry = {
      assignmentType: "pickup",
      previousPartnerId,
      partnerId: null,
      assignedBy: assignedByVal,
      assignedAt: new Date(),
      status: "unassigned",
      note: "Pickup partner assignment removed by admin",
    };

    await Order.findByIdAndUpdate(
      order._id,
      {
        $set: {
          pickupPartner: {
            partnerId: null,
            assignedAt: null,
            assignedBy: null,
            status: "assigned",
            pickedUpAt: null,
          },
          updatedAt: new Date(),
        },
        $push: {
          assignmentHistory: historyEntry,
        },
      },
      { new: true, runValidators: false }
    );

    await syncPartnerAvailability(previousPartnerId);

    const populatedOrder = await Order.findById(order._id)
      .populate("pickupPartner.partnerId", "partnerId fullName mobileNumber avatar availabilityStatus isActive")
      .populate("deliveryPartner.partnerId", "partnerId fullName mobileNumber avatar availabilityStatus isActive")
      .populate("assignmentHistory.partnerId", "partnerId fullName mobileNumber avatar")
      .populate("assignmentHistory.previousPartnerId", "partnerId fullName mobileNumber avatar")
      .lean();

    await invalidateOrderCache(order._id, order.vendorId);

    return res.json({
      success: true,
      message: "Pickup partner assignment removed successfully",
      data: populatedOrder,
    });
  } catch (error) {
    console.error("REMOVE pickup partner error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to remove pickup partner",
      error: error.message,
    });
  }
}

// =========================================================
// ASSIGN DELIVERY PARTNER
// POST /api/orders/:orderId/assign-delivery-partner
// =========================================================
export async function assignDeliveryPartner(req, res) {
  try {
    const { orderId } = req.params;
    const { partnerId, note = "" } = req.body;

    if (!partnerId || !mongoose.Types.ObjectId.isValid(partnerId)) {
      return res.status(400).json({
        success: false,
        message: "A valid partner ID is required",
      });
    }

    const orderQuery = mongoose.Types.ObjectId.isValid(orderId)
      ? { $or: [{ _id: orderId }, { orderId: orderId }] }
      : { orderId: orderId };

    const order = await Order.findOne(orderQuery);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Validation rules
    if (order.status === "cancelled") {
      return res.status(400).json({
        success: false,
        message: "Cannot assign delivery partner to a cancelled order",
      });
    }

    if (order.status === "completed") {
      return res.status(400).json({
        success: false,
        message: "Order is already completed/delivered",
      });
    }

    const partner = await DeliveryPartner.findById(partnerId);

    if (!partner) {
      return res.status(404).json({
        success: false,
        message: "Delivery partner not found",
      });
    }

    if (!partner.isActive) {
      return res.status(400).json({
        success: false,
        message: "Cannot assign an inactive delivery partner",
      });
    }

    if (partner.availabilityStatus === "Offline") {
      return res.status(400).json({
        success: false,
        message: "Cannot assign an offline delivery partner",
      });
    }

    const oldPartnerId = order.deliveryPartner?.partnerId || null;
    const isReassignment = oldPartnerId && String(oldPartnerId) !== String(partner._id);
    const assignedByVal = (req.user?.id && mongoose.Types.ObjectId.isValid(req.user.id))
      ? new mongoose.Types.ObjectId(req.user.id)
      : null;

    const historyEntry = {
      assignmentType: "delivery",
      previousPartnerId: oldPartnerId,
      partnerId: partner._id,
      assignedBy: assignedByVal,
      assignedAt: new Date(),
      status: "assigned",
      note: note || (isReassignment ? "Delivery partner reassigned" : "Delivery partner assigned"),
    };

    await Order.findByIdAndUpdate(
      order._id,
      {
        $set: {
          deliveryPartner: {
            partnerId: partner._id,
            assignedAt: new Date(),
            assignedBy: assignedByVal,
            status: "assigned",
            deliveredAt: null,
          },
          updatedAt: new Date(),
        },
        $push: {
          assignmentHistory: historyEntry,
        },
      },
      { new: true, runValidators: false }
    );

    // Sync availability
    await syncPartnerAvailability(partner._id);
    if (oldPartnerId && String(oldPartnerId) !== String(partner._id)) {
      await syncPartnerAvailability(oldPartnerId);
    }

    const populatedOrder = await Order.findById(order._id)
      .populate("pickupPartner.partnerId", "partnerId fullName mobileNumber avatar availabilityStatus isActive")
      .populate("deliveryPartner.partnerId", "partnerId fullName mobileNumber avatar availabilityStatus isActive")
      .populate("assignmentHistory.partnerId", "partnerId fullName mobileNumber avatar")
      .populate("assignmentHistory.previousPartnerId", "partnerId fullName mobileNumber avatar")
      .populate("assignmentHistory.assignedBy", "name email")
      .lean();

    if (order.vendorId) {
      emitToVendor(order.vendorId, "order_delivery_assigned", {
        orderId: order._id,
        deliveryPartner: populatedOrder.deliveryPartner,
      });
    }

    await invalidateOrderCache(order._id, order.vendorId);

    return res.json({
      success: true,
      message: isReassignment
        ? `Delivery partner reassigned to ${partner.fullName}`
        : `Delivery partner ${partner.fullName} assigned successfully`,
      data: populatedOrder,
    });
  } catch (error) {
    console.error("ASSIGN delivery partner error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to assign delivery partner",
      error: error.message,
    });
  }
}

// =========================================================
// UPDATE PICKUP STATUS
// PATCH /api/orders/:orderId/pickup-status
// =========================================================
export async function updatePickupStatus(req, res) {
  try {
    const { orderId } = req.params;
    const { status } = req.body;

    if (!["on-the-way", "completed"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Status must be 'on-the-way' or 'completed'",
      });
    }

    const orderQuery = mongoose.Types.ObjectId.isValid(orderId)
      ? { $or: [{ _id: orderId }, { orderId: orderId }] }
      : { orderId: orderId };

    const order = await Order.findOne(orderQuery);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    if (!order.pickupPartner?.partnerId) {
      return res.status(400).json({
        success: false,
        message: "No pickup partner assigned to this order",
      });
    }

    const updateFields = {
      "pickupPartner.status": status,
      updatedAt: new Date(),
    };

    if (status === "completed") {
      updateFields["pickupPartner.pickedUpAt"] = new Date();
      updateFields.pickedAt = new Date();
      updateFields.status = "picked-up";
    }

    const assignedByVal = (req.user?.id && mongoose.Types.ObjectId.isValid(req.user.id))
      ? new mongoose.Types.ObjectId(req.user.id)
      : null;

    const historyEntry = {
      assignmentType: "pickup",
      previousPartnerId: null,
      partnerId: order.pickupPartner.partnerId,
      assignedBy: assignedByVal,
      assignedAt: new Date(),
      status,
      note: `Pickup partner status marked '${status}'`,
    };

    await Order.findByIdAndUpdate(
      order._id,
      {
        $set: updateFields,
        $push: { assignmentHistory: historyEntry },
      },
      { new: true, runValidators: false }
    );

    await syncPartnerAvailability(order.pickupPartner.partnerId);

    const populatedOrder = await Order.findById(order._id)
      .populate("pickupPartner.partnerId", "partnerId fullName mobileNumber avatar availabilityStatus isActive")
      .populate("deliveryPartner.partnerId", "partnerId fullName mobileNumber avatar availabilityStatus isActive")
      .lean();

    await invalidateOrderCache(order._id, order.vendorId);

    return res.json({
      success: true,
      message: `Pickup status updated to '${status}'`,
      data: populatedOrder,
    });
  } catch (error) {
    console.error("UPDATE pickup status error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update pickup status",
      error: error.message,
    });
  }
}

// =========================================================
// UPDATE DELIVERY STATUS
// PATCH /api/orders/:orderId/delivery-status
// =========================================================
export async function updateDeliveryStatus(req, res) {
  try {
    const { orderId } = req.params;
    const { status } = req.body;

    if (!["on-the-way", "completed"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Status must be 'on-the-way' or 'completed'",
      });
    }

    const orderQuery = mongoose.Types.ObjectId.isValid(orderId)
      ? { $or: [{ _id: orderId }, { orderId: orderId }] }
      : { orderId: orderId };

    const order = await Order.findOne(orderQuery);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    if (!order.deliveryPartner?.partnerId) {
      return res.status(400).json({
        success: false,
        message: "A delivery partner must be assigned before updating delivery status",
      });
    }

    const updateFields = {
      "deliveryPartner.status": status,
      updatedAt: new Date(),
    };

    if (status === "on-the-way") {
      updateFields.status = "out-for-delivery";
    } else if (status === "completed") {
      updateFields["deliveryPartner.deliveredAt"] = new Date();
      updateFields.deliveredAt = new Date();
      updateFields.status = "completed";
    }

    const assignedByVal = (req.user?.id && mongoose.Types.ObjectId.isValid(req.user.id))
      ? new mongoose.Types.ObjectId(req.user.id)
      : null;

    const historyEntry = {
      assignmentType: "delivery",
      previousPartnerId: null,
      partnerId: order.deliveryPartner.partnerId,
      assignedBy: assignedByVal,
      assignedAt: new Date(),
      status,
      note: `Delivery partner status marked '${status}'`,
    };

    await Order.findByIdAndUpdate(
      order._id,
      {
        $set: updateFields,
        $push: { assignmentHistory: historyEntry },
      },
      { new: true, runValidators: false }
    );

    await syncPartnerAvailability(order.deliveryPartner.partnerId);

    const populatedOrder = await Order.findById(order._id)
      .populate("pickupPartner.partnerId", "partnerId fullName mobileNumber avatar availabilityStatus isActive")
      .populate("deliveryPartner.partnerId", "partnerId fullName mobileNumber avatar availabilityStatus isActive")
      .lean();

    await invalidateOrderCache(order._id, order.vendorId);

    return res.json({
      success: true,
      message: `Delivery status updated to '${status}'`,
      data: populatedOrder,
    });
  } catch (error) {
    console.error("UPDATE delivery status error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update delivery status",
      error: error.message,
    });
  }
}

// =========================================================
// ASSIGNMENTS OVERVIEW
// GET /api/delivery-partners/assignments/overview
// =========================================================
export async function getAssignmentsOverview(req, res) {
  try {
    const { type = "all", status = "all", search = "" } = req.query;

    const filter = {
      status: { $nin: ["cancelled"] },
    };

    if (type === "pickup") {
      filter["pickupPartner.partnerId"] = { $ne: null };
      if (status !== "all") {
        filter["pickupPartner.status"] = status;
      }
    } else if (type === "delivery") {
      filter["deliveryPartner.partnerId"] = { $ne: null };
      if (status !== "all") {
        filter["deliveryPartner.status"] = status;
      }
    } else {
      filter.$or = [
        { "pickupPartner.partnerId": { $ne: null } },
        { "deliveryPartner.partnerId": { $ne: null } },
      ];
    }

    if (search.trim()) {
      const q = search.trim();
      filter.$and = filter.$and || [];
      filter.$and.push({
        $or: [
          { orderId: { $regex: q, $options: "i" } },
          { customerName: { $regex: q, $options: "i" } },
          { customerPhone: { $regex: q, $options: "i" } },
        ],
      });
    }

    const orders = await Order.find(filter)
      .populate("pickupPartner.partnerId", "partnerId fullName mobileNumber avatar availabilityStatus")
      .populate("deliveryPartner.partnerId", "partnerId fullName mobileNumber avatar availabilityStatus")
      .sort({ updatedAt: -1 })
      .lean();

    return res.json({
      success: true,
      count: orders.length,
      data: orders,
    });
  } catch (error) {
    console.error("GET assignments overview error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch assignments overview",
      error: error.message,
    });
  }
}

