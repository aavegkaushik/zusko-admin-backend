import assert from "node:assert/strict";
import {
  isPromotionActive,
  isItemEligibleForPromotion,
  calculateDiscountAmount,
  resolveWinningPromotion,
  calculateItemPromotionalPricing,
  applyPromotionsToItems,
} from "../utils/promotionCalculator.js";

console.log("Starting Promotion Calculator Unit Tests...");

// Test 1: Active date check
const now = new Date("2026-11-06T12:00:00Z");
const activePromo = {
  name: "Active Promo",
  isActive: true,
  startDate: new Date("2026-11-01T00:00:00Z"),
  endDate: new Date("2026-11-10T00:00:00Z"),
};
assert.equal(isPromotionActive(activePromo, now), true, "Should be active");

const expiredPromo = {
  name: "Expired",
  isActive: true,
  startDate: new Date("2026-10-01T00:00:00Z"),
  endDate: new Date("2026-10-31T00:00:00Z"),
};
assert.equal(isPromotionActive(expiredPromo, now), false, "Should be expired");

const scheduledPromo = {
  name: "Future",
  isActive: true,
  startDate: new Date("2026-12-01T00:00:00Z"),
};
assert.equal(isPromotionActive(scheduledPromo, now), false, "Should be scheduled");

// Test 2: Calculate Discount Amount
// 50% of ₹40 = ₹20
const percentPromo = { discountType: "percentage", discountValue: 50 };
assert.equal(calculateDiscountAmount(40, percentPromo), 20);

// 50% of ₹40 with maxDiscount ₹15 = ₹15
const cappedPromo = { discountType: "percentage", discountValue: 50, maxDiscount: 15 };
assert.equal(calculateDiscountAmount(40, cappedPromo), 15);

// Flat ₹15 off on ₹40 = ₹15
const flatPromo = { discountType: "flat", discountValue: 15 };
assert.equal(calculateDiscountAmount(40, flatPromo), 15);

// Flat ₹50 off on ₹40 = ₹40 (cannot exceed original price)
const bigFlatPromo = { discountType: "flat", discountValue: 50 };
assert.equal(calculateDiscountAmount(40, bigFlatPromo), 40);

// Test 3: Eligibility Scope
const itemMenShirt = {
  _id: "660000000000000000000001",
  name: "Shirt",
  category: "Men",
  service: "Wash & Fold",
  price: 40,
};

const itemWomenSaree = {
  _id: "660000000000000000000002",
  name: "Saree",
  category: "Women",
  service: "Dry Clean",
  price: 150,
};

// All items scope
const promoAll = { applicableTo: "all", isActive: true };
assert.equal(isItemEligibleForPromotion(itemMenShirt, promoAll), true);
assert.equal(isItemEligibleForPromotion(itemWomenSaree, promoAll), true);

// Category scope
const promoMenOnly = {
  applicableTo: "categories",
  applicableCategories: ["Men"],
  isActive: true,
};
assert.equal(isItemEligibleForPromotion(itemMenShirt, promoMenOnly), true);
assert.equal(isItemEligibleForPromotion(itemWomenSaree, promoMenOnly), false);

// Specific items scope
const promoSpecificItem = {
  applicableTo: "items",
  applicableItems: ["660000000000000000000001"],
  isActive: true,
};
assert.equal(isItemEligibleForPromotion(itemMenShirt, promoSpecificItem), true);
assert.equal(isItemEligibleForPromotion(itemWomenSaree, promoSpecificItem), false);

// Service restriction
const promoDryCleanOnly = {
  applicableTo: "all",
  applicableServices: ["Dry Clean"],
  isActive: true,
};
assert.equal(isItemEligibleForPromotion(itemMenShirt, promoDryCleanOnly), false);
assert.equal(isItemEligibleForPromotion(itemWomenSaree, promoDryCleanOnly), true);

// Test 4: Conflict Resolution and Priority
// Promo 1: General 20% off all items (priority 1)
const promo1 = {
  _id: "p1",
  name: "Site-wide 20%",
  discountType: "percentage",
  discountValue: 20,
  applicableTo: "all",
  priority: 1,
  isActive: true,
};

// Promo 2: 50% off Men category (priority 5)
const promo2 = {
  _id: "p2",
  name: "Men 50% Off",
  discountType: "percentage",
  discountValue: 50,
  applicableTo: "categories",
  applicableCategories: ["Men"],
  priority: 5,
  isActive: true,
};

// When both match itemMenShirt, promo2 (higher priority 5) must win
const winner = resolveWinningPromotion(itemMenShirt, [promo1, promo2]);
assert.equal(winner._id, "p2", "Higher priority promotion must win");

// Test 5: Dynamic calculation preserves original price and never stacks
const pricingResult = calculateItemPromotionalPricing(itemMenShirt, [promo1, promo2], now);
assert.equal(pricingResult.originalPrice, 40, "Original price must be 40");
assert.equal(pricingResult.discountAmount, 20, "Discount should be 20 (50% of 40)");
assert.equal(pricingResult.finalPrice, 20, "Final price should be 20");
assert.equal(pricingResult.appliedPromotion.name, "Men 50% Off");
assert.equal(pricingResult.hasActivePromotion, true);

// Ensure the item object's original price field was not modified in place
assert.equal(itemMenShirt.price, 40);

console.log("All Promotion Calculator tests PASSED successfully!");

