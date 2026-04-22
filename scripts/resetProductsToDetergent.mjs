import "dotenv/config";
import mongoose from "mongoose";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

import Product from "../models/Product.js";
import User from "../models/User.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, "..");
const imageDir = path.join(backendRoot, "assets", "product-images");

const publicBaseUrl = (process.env.BACKEND_PUBLIC_BASE_URL || "http://localhost:5000").replace(
  /\/+$/,
  "",
);

const detergentProducts = [
  {
    name: "Tide Plus Double Power Detergent Powder",
    description: "Strong stain removal detergent powder for daily clothes wash.",
    price: 120,
    stock: 220,
    prompt:
      "pack shot of blue detergent powder pouch on white background, realistic product photography",
  },
  {
    name: "Surf Excel Easy Wash Detergent Powder",
    description: "Detergent powder designed for quick cleaning and fresh fragrance.",
    price: 135,
    stock: 180,
    prompt:
      "detergent powder packet on wooden table with laundry basket, realistic, studio lighting",
  },
  {
    name: "Ariel Matic Front Load Detergent Powder",
    description: "Machine wash detergent powder for front load washing machines.",
    price: 210,
    stock: 140,
    prompt:
      "front load detergent powder pack beside washing machine, realistic commercial photo",
  },
  {
    name: "Rin Advanced Detergent Powder",
    description: "Everyday detergent powder for bright and clean clothes.",
    price: 105,
    stock: 260,
    prompt:
      "detergent powder pack closeup with soap bubbles and clean clothes background, realistic",
  },
  {
    name: "Ghadi Detergent Powder",
    description: "Budget-friendly detergent powder suitable for family laundry.",
    price: 95,
    stock: 310,
    prompt:
      "detergent powder pouch product photo, neutral background, realistic grocery style",
  },
  {
    name: "Wheel Active 2-in-1 Detergent Powder",
    description: "Detergent powder with lemon freshness and active cleaning particles.",
    price: 98,
    stock: 290,
    prompt:
      "green detergent powder packet with lemon elements, realistic product photography",
  },
  {
    name: "Nirma Super Detergent Powder",
    description: "Classic detergent powder for regular household washing.",
    price: 88,
    stock: 350,
    prompt:
      "detergent powder packet in supermarket shelf style image, realistic lighting",
  },
  {
    name: "Detergent Cake Lemon Fresh Bar",
    description: "Detergent cake bar for hand wash garments and collars.",
    price: 35,
    stock: 500,
    prompt:
      "yellow detergent cake soap bar product photo on white tile, realistic details",
  },
  {
    name: "Detergent Cake Classic Blue Bar",
    description: "Multipurpose detergent cake for hand-wash and pre-soak cleaning.",
    price: 32,
    stock: 520,
    prompt:
      "blue detergent cake soap bar with water splashes, realistic closeup product photo",
  },
  {
    name: "Detergent Combo Pack (Powder + Cake)",
    description: "Combo laundry pack with detergent powder and detergent cake.",
    price: 155,
    stock: 170,
    prompt:
      "laundry combo pack with detergent powder pouch and detergent cake bar, realistic",
  },
];

const createImageCandidates = (prompt, seed) => [
  `https://loremflickr.com/1024/1024/${encodeURIComponent(prompt)}?lock=${seed}`,
  `https://picsum.photos/seed/detergent-${seed}/1024/1024`,
];

const saveImage = async (urls, filePath) => {
  for (const url of urls) {
    const response = await fetch(url);
    if (!response.ok) {
      continue;
    }

    const arrayBuffer = await response.arrayBuffer();
    await fs.writeFile(filePath, Buffer.from(arrayBuffer));
    return;
  }

  throw new Error("Image download failed for all providers.");
};

const run = async () => {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    throw new Error("MONGO_URI is not configured.");
  }

  await fs.mkdir(imageDir, { recursive: true });

  const productsWithImages = [];
  for (let index = 0; index < detergentProducts.length; index += 1) {
    const product = detergentProducts[index];
    const fileName = `detergent-${String(index + 1).padStart(2, "0")}.jpg`;
    const filePath = path.join(imageDir, fileName);
    const imageSourceUrls = createImageCandidates(product.prompt, 700 + index);

    await saveImage(imageSourceUrls, filePath);

    productsWithImages.push({
      name: product.name,
      description: product.description,
      price: product.price,
      stock: product.stock,
      category: "Detergent",
      imageUrl: `${publicBaseUrl}/assets/product-images/${fileName}`,
      images: [{ url: `${publicBaseUrl}/assets/product-images/${fileName}`, publicId: "" }],
      cloudinaryPublicId: "",
      isActive: true,
    });
  }

  await mongoose.connect(mongoUri);

  const beforeCount = await Product.countDocuments({});

  const owner =
    (await User.findOne({ email: "admin@cleanora.app" }).select("_id email")) ||
    (await User.findOne({ email: "admin@storesync.local" }).select("_id email")) ||
    (await User.findOne({ role: { $in: ["super_admin", "admin"] } }).select("_id email"));

  if (!owner?._id) {
    throw new Error("No admin account found. Create an admin before running this script.");
  }

  await Product.deleteMany({});
  const now = new Date();
  const created = await Product.insertMany(
    productsWithImages.map((product) => ({
      ...product,
      createdBy: owner._id,
      createdAt: now,
      updatedAt: now,
    })),
  );
  const afterCount = await Product.countDocuments({});

  console.log(`PRODUCT_COUNT_BEFORE=${beforeCount}`);
  console.log(`PRODUCT_COUNT_AFTER=${afterCount}`);
  console.log(`SEEDED_DETERGENT_PRODUCTS=${created.length}`);
  console.log(`PRODUCT_OWNER_EMAIL=${owner.email}`);
  console.log(
    `SEEDED_IMAGES=${created
      .map((item) => item.imageUrl)
      .slice(0, 3)
      .join(" | ")}${created.length > 3 ? " | ..." : ""}`,
  );
};

run()
  .catch((error) => {
    console.error("RESET_PRODUCTS_FAILED", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
