import dotenv from "dotenv";
import mongoose from "mongoose";
import Pricing from "../Models/Pricing.js";

dotenv.config({ override: true });

const pricingData = [
  // =====================================================
  // MEN
  // =====================================================

  // Wash & Fold
  {
    service: "Wash & Fold",
    category: "Men",
    name: "Shirt",
    price: 20,
  },
  {
    service: "Wash & Fold",
    category: "Men",
    name: "T-Shirt",
    price: 15,
  },
  {
    service: "Wash & Fold",
    category: "Men",
    name: "Jeans",
    price: 40,
  },
  {
    service: "Wash & Fold",
    category: "Men",
    name: "Trousers",
    price: 35,
  },
  {
    service: "Wash & Fold",
    category: "Men",
    name: "Shorts",
    price: 25,
  },
  {
    service: "Wash & Fold",
    category: "Men",
    name: "Kurta",
    price: 30,
  },
  {
    service: "Wash & Fold",
    category: "Men",
    name: "Blazer",
    price: 80,
  },
  {
    service: "Wash & Fold",
    category: "Men",
    name: "Suit",
    variant: "2 Piece",
    price: 120,
  },
  {
    service: "Wash & Fold",
    category: "Men",
    name: "Suit",
    variant: "3 Piece",
    price: 150,
  },
  {
    service: "Wash & Fold",
    category: "Men",
    name: "Jacket",
    price: 70,
  },
  {
    service: "Wash & Fold",
    category: "Men",
    name: "Sweater",
    price: 50,
  },
  {
    service: "Wash & Fold",
    category: "Men",
    name: "Hoodie",
    price: 45,
  },
  {
    service: "Wash & Fold",
    category: "Men",
    name: "Innerwear",
    price: 10,
  },

  // =====================================================
  // WOMEN
  // =====================================================

  {
    service: "Wash & Fold",
    category: "Women",
    name: "Kurti",
    price: 30,
  },
  {
    service: "Wash & Fold",
    category: "Women",
    name: "Leggings",
    price: 20,
  },
  {
    service: "Wash & Fold",
    category: "Women",
    name: "Saree",
    variant: "Normal",
    price: 80,
  },
  {
    service: "Wash & Fold",
    category: "Women",
    name: "Saree",
    variant: "Heavy",
    price: 120,
  },
  {
    service: "Wash & Fold",
    category: "Women",
    name: "Blouse",
    price: 25,
  },
  {
    service: "Wash & Fold",
    category: "Women",
    name: "Top",
    price: 25,
  },
  {
    service: "Wash & Fold",
    category: "Women",
    name: "Dress",
    price: 60,
  },
  {
    service: "Wash & Fold",
    category: "Women",
    name: "Gown",
    price: 100,
  },
  {
    service: "Wash & Fold",
    category: "Women",
    name: "Dupatta",
    price: 20,
  },
  {
    service: "Wash & Fold",
    category: "Women",
    name: "Skirt",
    price: 35,
  },
  {
    service: "Wash & Fold",
    category: "Women",
    name: "Jacket",
    price: 70,
  },
  {
    service: "Wash & Fold",
    category: "Women",
    name: "Sweater",
    price: 50,
  },

  // =====================================================
  // KIDS
  // =====================================================

  {
    service: "Wash & Fold",
    category: "Kids",
    name: "Kids Shirt",
    price: 10,
  },
  {
    service: "Wash & Fold",
    category: "Kids",
    name: "Kids T-Shirt",
    price: 8,
  },
  {
    service: "Wash & Fold",
    category: "Kids",
    name: "Kids Jeans",
    price: 20,
  },
  {
    service: "Wash & Fold",
    category: "Kids",
    name: "Kids Shorts",
    price: 15,
  },
  {
    service: "Wash & Fold",
    category: "Kids",
    name: "School Uniform",
    price: 25,
  },
  {
    service: "Wash & Fold",
    category: "Kids",
    name: "Kids Jacket",
    price: 30,
  },
  {
    service: "Wash & Fold",
    category: "Kids",
    name: "Kids Sweater",
    price: 25,
  },
  {
    service: "Wash & Fold",
    category: "Kids",
    name: "Frock",
    price: 20,
  },

  // =====================================================
  // HOUSEHOLD
  // =====================================================

  {
    service: "Wash & Fold",
    category: "Household",
    name: "Bedsheet",
    variant: "Single",
    price: 40,
  },
  {
    service: "Wash & Fold",
    category: "Household",
    name: "Bedsheet",
    variant: "Double",
    price: 50,
  },
  {
    service: "Wash & Fold",
    category: "Household",
    name: "Blanket",
    price: 80,
  },
  {
    service: "Wash & Fold",
    category: "Household",
    name: "Quilt/Rajai",
    price: 120,
  },
  {
    service: "Wash & Fold",
    category: "Household",
    name: "Pillow Cover",
    price: 10,
  },
  {
    service: "Wash & Fold",
    category: "Household",
    name: "Curtains",
    variant: "Light",
    price: 60,
  },
  {
    service: "Wash & Fold",
    category: "Household",
    name: "Curtains",
    variant: "Heavy",
    price: 100,
  },
  {
    service: "Wash & Fold",
    category: "Household",
    name: "Sofa Cover",
    price: 90,
  },
  {
    service: "Wash & Fold",
    category: "Household",
    name: "Towel",
    price: 15,
  },
  {
    service: "Wash & Fold",
    category: "Household",
    name: "Carpet",
    variant: "Small",
    price: 100,
  },
  {
    service: "Wash & Fold",
    category: "Household",
    name: "Carpet",
    variant: "Large",
    price: 200,
  },
];

async function seedPricing() {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error(
        "MONGO_URI is missing from environment"
      );
    }

    await mongoose.connect(process.env.MONGO_URI);

    console.log("MongoDB connected");

    let created = 0;
    let updated = 0;

    for (const item of pricingData) {
      const existing = await Pricing.findOne({
        service: item.service,
        category: item.category,
        name: item.name,
        variant: item.variant || "",
        careLevel: item.careLevel || "regular",
      });

      if (existing) {
        existing.price = item.price;
        existing.active = true;

        await existing.save();

        updated++;
      } else {
        await Pricing.create({
          ...item,
          variant: item.variant || "",
          careLevel:
            item.careLevel || "regular",
          active: true,
        });

        created++;
      }
    }

    console.log("=================================");
    console.log("Pricing seed completed");
    console.log("Created:", created);
    console.log("Updated:", updated);
    console.log("Total:", pricingData.length);
    console.log("=================================");

    await mongoose.disconnect();

    process.exit(0);
  } catch (error) {
    console.error(
      "Pricing seed failed:",
      error
    );

    await mongoose.disconnect().catch(() => {});

    process.exit(1);
  }
}

seedPricing();