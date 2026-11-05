import assert from "node:assert/strict";
import mongoose from "mongoose";
import Promotion from "../Models/Promotion.js";
import Pricing from "../Models/Pricing.js";
import {
  isPromotionActive,
  isItemEligibleForPromotion,
  calculateDiscountAmount,
  resolveWinningPromotion,
  calculateItemPromotionalPricing,
  applyPromotionsToItems,
} from "../utils/promotionCalculator.js";
import {
  createPromotion,
  updatePromotion,
  togglePromotionStatus,
  deletePromotion,
  previewPromotions,
  getActivePromotions,
} from "../controllers/promotion.controller.js";

console.log("==================================================");
console.log("RUNNING ZUSKO PROMOTION SYSTEM TEST SUITE");
console.log("==================================================");

// ---------------------------------------------------------------------
// TEST 1: Schema Structure and Validation
// ---------------------------------------------------------------------
console.log("\n[Test 1] Testing Promotion Model Validation...");
const promoDoc = new Promotion({
  name: "Summer Mega Discount",
  discountType: "percentage",
  discountValue: 25,
  applicableTo: "categories",
  applicableCategories: ["Men", "Women"],
  priority: 10,
  allowCouponStacking: false,
});

assert.equal(promoDoc.name, "Summer Mega Discount");
assert.equal(promoDoc.discountType, "percentage");
assert.equal(promoDoc.discountValue, 25);
assert.equal(promoDoc.applicableTo, "categories");
assert.deepEqual(promoDoc.applicableCategories, ["Men", "Women"]);
assert.equal(promoDoc.priority, 10);
assert.equal(promoDoc.isActive, true);
assert.equal(promoDoc.allowCouponStacking, false);

// Check invalid discountType validation
const invalidTypeDoc = new Promotion({
  name: "Bad Promo",
  discountType: "invalid_type",
  discountValue: 10,
});
const validationErr = invalidTypeDoc.validateSync();
assert(validationErr !== undefined, "Should fail validation on invalid discountType");
console.log("✓ Model schema and validations verified.");

// ---------------------------------------------------------------------
// TEST 2: Dynamic Pricing & Original Price Preservation
// ---------------------------------------------------------------------
console.log("\n[Test 2] Testing Original Price Preservation...");
const samplePricingItem = {
  _id: new mongoose.Types.ObjectId("660000000000000000000001"),
  service: "Wash & Fold",
  category: "Men",
  name: "Shirt",
  variant: "Regular",
  careLevel: "regular",
  price: 40,
  active: true,
};

const fiftyPercentPromo = {
  _id: new mongoose.Types.ObjectId("660000000000000000000002"),
  name: "50% Off Everything",
  discountType: "percentage",
  discountValue: 50,
  applicableTo: "all",
  priority: 1,
  isActive: true,
};

const result = calculateItemPromotionalPricing(samplePricingItem, [fiftyPercentPromo]);

assert.equal(result.originalPrice, 40, "Original price must remain 40");
assert.equal(result.discountAmount, 20, "Discount amount must be 20");
assert.equal(result.finalPrice, 20, "Final price must be 20");
assert.equal(samplePricingItem.price, 40, "Original Pricing item price property must NOT be mutated");
console.log("✓ Original price preserved, dynamic discount correctly computed: ₹40 -> 50% OFF -> ₹20.");

// ---------------------------------------------------------------------
// TEST 3: Flat Discount Calculations & Edge Cases
// ---------------------------------------------------------------------
console.log("\n[Test 3] Testing Flat Discounts & Upper Bounds...");
const flatFifteenPromo = {
  _id: new mongoose.Types.ObjectId("660000000000000000000003"),
  name: "Flat ₹15 Off",
  discountType: "flat",
  discountValue: 15,
  applicableTo: "all",
  priority: 1,
  isActive: true,
};

const flatResult = calculateItemPromotionalPricing(samplePricingItem, [flatFifteenPromo]);
assert.equal(flatResult.originalPrice, 40);
assert.equal(flatResult.discountAmount, 15);
assert.equal(flatResult.finalPrice, 25);

// Test discount greater than item price (should cap at original price, final price = 0)
const flatHundredPromo = {
  _id: new mongoose.Types.ObjectId("660000000000000000000004"),
  name: "Flat ₹100 Off",
  discountType: "flat",
  discountValue: 100,
  applicableTo: "all",
  priority: 1,
  isActive: true,
};
const zeroResult = calculateItemPromotionalPricing(samplePricingItem, [flatHundredPromo]);
assert.equal(zeroResult.discountAmount, 40, "Discount cannot exceed original item price");
assert.equal(zeroResult.finalPrice, 0, "Final price cannot be negative");
console.log("✓ Flat discount bounds and non-negative constraints verified.");

// ---------------------------------------------------------------------
// TEST 4: Conflict Resolution and Priority Overrides
// ---------------------------------------------------------------------
console.log("\n[Test 4] Testing Conflict Resolution and Non-Stacking...");

// Promo A: 10% off all items, priority 1
const promoA = {
  _id: "promo_a",
  name: "10% Site-wide",
  discountType: "percentage",
  discountValue: 10,
  applicableTo: "all",
  priority: 1,
  isActive: true,
};

// Promo B: 30% off Men category, priority 5
const promoB = {
  _id: "promo_b",
  name: "30% Men Special",
  discountType: "percentage",
  discountValue: 30,
  applicableTo: "categories",
  applicableCategories: ["Men"],
  priority: 5,
  isActive: true,
};

// Promo C: Flat ₹25 off Shirt specifically, priority 10
const promoC = {
  _id: "promo_c",
  name: "Shirt Exclusive ₹25 Off",
  discountType: "flat",
  discountValue: 25,
  applicableTo: "items",
  applicableItems: ["660000000000000000000001"],
  priority: 10,
  isActive: true,
};

// When promoA, promoB, and promoC all match samplePricingItem:
// Highest priority (promoC, priority 10) MUST win.
const resolved = resolveWinningPromotion(samplePricingItem, [promoA, promoB, promoC]);
assert.equal(resolved._id, "promo_c", "Highest priority (10) must override lower priorities (5, 1)");

const combinedPricing = calculateItemPromotionalPricing(samplePricingItem, [promoA, promoB, promoC]);
assert.equal(combinedPricing.appliedPromotion._id, "promo_c");
assert.equal(combinedPricing.discountAmount, 25, "Must apply ONLY winning promotion, NEVER stack multiple promotions");
assert.equal(combinedPricing.finalPrice, 15);
console.log("✓ Conflict resolution verified: High priority overrides lower, strictly single winning promotion applied.");

// ---------------------------------------------------------------------
// TEST 5: Category Scope & Item Scope Targeting
// ---------------------------------------------------------------------
console.log("\n[Test 5] Testing Targeting Scopes (Categories & Items)...");
const womenDressItem = {
  _id: "660000000000000000000099",
  name: "Silk Dress",
  category: "Women",
  service: "Dry Clean",
  price: 200,
};

// promoB is applicable only to "Men"
assert.equal(isItemEligibleForPromotion(womenDressItem, promoB), false);
// promoA is applicable to "all"
assert.equal(isItemEligibleForPromotion(womenDressItem, promoA), true);

const womenPricing = calculateItemPromotionalPricing(womenDressItem, [promoA, promoB]);
assert.equal(womenPricing.appliedPromotion._id, "promo_a", "Women item should receive promoA (10% off)");
assert.equal(womenPricing.discountAmount, 20);
assert.equal(womenPricing.finalPrice, 180);
console.log("✓ Scope targeting verified for categories and items.");

// ---------------------------------------------------------------------
// TEST 6: Date Scheduling and Expiration
// ---------------------------------------------------------------------
console.log("\n[Test 6] Testing Start and End Date Rules...");
const baseTime = new Date("2026-11-06T12:00:00Z");

const scheduledInFuture = {
  isActive: true,
  startDate: new Date("2026-11-10T00:00:00Z"),
  endDate: new Date("2026-11-20T00:00:00Z"),
};
assert.equal(isPromotionActive(scheduledInFuture, baseTime), false, "Future scheduled promo must not be active today");

const activeToday = {
  isActive: true,
  startDate: new Date("2026-11-01T00:00:00Z"),
  endDate: new Date("2026-11-15T00:00:00Z"),
};
assert.equal(isPromotionActive(activeToday, baseTime), true, "Promo within date window must be active");

const expiredYesterday = {
  isActive: true,
  startDate: new Date("2026-10-01T00:00:00Z"),
  endDate: new Date("2026-11-05T00:00:00Z"),
};
assert.equal(isPromotionActive(expiredYesterday, baseTime), false, "Expired promo must not be active");

const inactiveFlag = {
  isActive: false,
  startDate: new Date("2026-11-01T00:00:00Z"),
  endDate: new Date("2026-11-15T00:00:00Z"),
};
assert.equal(isPromotionActive(inactiveFlag, baseTime), false, "Promotion with isActive: false must not be active");
console.log("✓ Date scheduling and isActive toggling validated.");

// ---------------------------------------------------------------------
// TEST 7: Security & Admin Check
// ---------------------------------------------------------------------
console.log("\n[Test 7] Testing Security and Auth Guarding...");
function mockResponse() {
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

// Case 1: Unauthenticated request (no req.user)
const unauthReq = { user: null };
const unauthRes = mockResponse();
await createPromotion(unauthReq, unauthRes);
assert.equal(unauthRes.statusCode, 401, "Unauthenticated request must return 401");

// Case 2: Unauthorized role (customer trying to create promotion)
const customerReq = { user: { id: "123", role: "customer" }, body: {} };
const customerRes = mockResponse();
await createPromotion(customerReq, customerRes);
assert.equal(customerRes.statusCode, 403, "Non-admin role must return 403 Forbidden");

// Case 3: Admin role allowed
const adminReq = {
  user: { id: "admin1", role: "admin" },
  body: {
    // Missing required name
  },
};
const adminRes = mockResponse();
await createPromotion(adminReq, adminRes);
assert.equal(adminRes.statusCode, 400, "Admin request with invalid payload should return 400 Validation Error");
assert(adminRes.body.message.includes("Promotion name is required"));
console.log("✓ Security and authorization middleware verified.");

console.log("\n==================================================");
console.log("ALL PROMOTION SUITE UNIT TESTS PASSED (7/7)");
console.log("==================================================");

