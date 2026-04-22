import "dotenv/config";

import mongoose from "mongoose";

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/storesync";

const sampleProducts = [
  {
    name: "Air Fryer XL 5L",
    description: "Rapid-heating air fryer with digital presets and non-stick basket.",
    price: 7499,
    category: "Kitchen Appliances",
    stock: 34,
  },
  {
    name: "Front Load Washing Machine 8kg",
    description: "Energy-efficient washer with quick wash and child lock.",
    price: 32999,
    category: "Laundry",
    stock: 12,
  },
  {
    name: "Frost Free Refrigerator 320L",
    description: "Double-door refrigerator with inverter compressor and fast cooling.",
    price: 38999,
    category: "Home Appliances",
    stock: 9,
  },
  {
    name: "Smart Microwave Oven 28L",
    description: "Convection microwave with auto-cook menu and defrost mode.",
    price: 12499,
    category: "Kitchen Appliances",
    stock: 21,
  },
  {
    name: "Robotic Vacuum Cleaner",
    description: "Wi-Fi enabled smart vacuum with mapping and self-charging dock.",
    price: 21999,
    category: "Cleaning Appliances",
    stock: 16,
  },
  {
    name: "Inverter Split AC 1.5 Ton",
    description: "Fast cooling air conditioner with sleep mode and copper condenser.",
    price: 42999,
    category: "Air Care",
    stock: 8,
  },
  {
    name: "HEPA Air Purifier Max",
    description: "Multi-stage purifier with real-time air quality indicator.",
    price: 15999,
    category: "Air Care",
    stock: 18,
  },
  {
    name: "Dishwasher 14 Place Settings",
    description: "Quiet dishwasher with eco wash and intensive cleaning programs.",
    price: 36999,
    category: "Kitchen Appliances",
    stock: 6,
  },
  {
    name: "Induction Cooktop FlexiHeat",
    description: "Portable induction cooktop with touch controls and timer.",
    price: 3499,
    category: "Kitchen Appliances",
    stock: 46,
  },
  {
    name: "Electric Kettle 1.8L",
    description: "Stainless steel kettle with auto shut-off and dry boil protection.",
    price: 1799,
    category: "Kitchen Appliances",
    stock: 65,
  },
  {
    name: "Sandwich Maker GrillPro",
    description: "Compact grill with non-stick plates and cool-touch handle.",
    price: 2299,
    category: "Kitchen Appliances",
    stock: 52,
  },
  {
    name: "Steam Iron Ceramic Glide",
    description: "Powerful steam iron with anti-drip system and ceramic soleplate.",
    price: 2699,
    category: "Home Appliances",
    stock: 39,
  },
  {
    name: "RO + UV Water Purifier",
    description: "Wall-mounted purifier with multi-stage filtration and mineral guard.",
    price: 15499,
    category: "Home Appliances",
    stock: 20,
  },
  {
    name: "Silent Breeze Ceiling Fan",
    description: "Remote-controlled fan with energy-saving BLDC motor.",
    price: 4999,
    category: "Home Appliances",
    stock: 27,
  },
];

const slugify = (value) =>
  String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "catalog-item";

const buildImageUrl = (name) =>
  `https://picsum.photos/seed/storesync-${slugify(name)}/1200/1200.jpg`;

const isUsableImageUrl = (value) => {
  if (typeof value !== "string") {
    return false;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }

  if (/via\.placeholder\.com|placehold\.co/i.test(trimmed)) {
    return false;
  }

  return !/\.svg(\?|$)/i.test(trimmed);
};

const run = async () => {
  await mongoose.connect(MONGO_URI);

  const db = mongoose.connection.db;
  const usersCollection = db.collection("users");
  const productsCollection = db.collection("products");

  const owner =
    (await usersCollection.findOne(
      { email: "admin.e2e.20260327014724@cleanora.app" },
      { projection: { _id: 1, email: 1 } },
    )) ||
    (await usersCollection.findOne(
      { email: "admin.e2e.20260327014724@storesync.local" },
      { projection: { _id: 1, email: 1 } },
    )) ||
    (await usersCollection.findOne(
      { role: { $in: ["admin", "super_admin"] } },
      { projection: { _id: 1, email: 1 } },
    ));

  if (!owner?._id) {
    throw new Error("No admin account found to assign as product owner.");
  }

  const existingProducts = await productsCollection.find({}).toArray();
  let normalizedCount = 0;

  for (const product of existingProducts) {
    const nextImageUrl = isUsableImageUrl(product.imageUrl)
      ? product.imageUrl.trim()
      : isUsableImageUrl(product.image)
        ? product.image.trim()
        : buildImageUrl(product.name || product._id);

    const nextIsActive =
      typeof product.isActive === "boolean"
        ? product.isActive
        : typeof product.is_active === "boolean"
          ? product.is_active
          : true;

    const shouldUpdate =
      nextImageUrl !== product.imageUrl ||
      nextIsActive !== product.isActive;

    if (!shouldUpdate) {
      continue;
    }

    await productsCollection.updateOne(
      { _id: product._id },
      {
        $set: {
          imageUrl: nextImageUrl,
          isActive: nextIsActive,
        },
      },
    );
    normalizedCount += 1;
  }

  const existingNames = new Set(
    (await productsCollection.find({}, { projection: { name: 1 } }).toArray()).map((product) =>
      String(product.name ?? "").trim().toLowerCase(),
    ),
  );

  const now = new Date();
  const productsToInsert = sampleProducts
    .filter((product) => !existingNames.has(product.name.trim().toLowerCase()))
    .map((product) => ({
      ...product,
      imageUrl: buildImageUrl(product.name),
      cloudinaryPublicId: "",
      isActive: true,
      createdBy: owner._id,
      createdAt: now,
      updatedAt: now,
    }));

  let insertedCount = 0;
  if (productsToInsert.length > 0) {
    const insertResult = await productsCollection.insertMany(productsToInsert);
    insertedCount = Object.keys(insertResult.insertedIds).length;
  }

  const totalProducts = await productsCollection.countDocuments({});

  console.log(
    JSON.stringify(
      {
        ownerEmail: owner.email,
        normalizedProducts: normalizedCount,
        insertedProducts: insertedCount,
        totalProducts,
      },
      null,
      2,
    ),
  );

  await mongoose.disconnect();
};

run().catch(async (error) => {
  console.error(error);
  try {
    await mongoose.disconnect();
  } catch {
    // Ignore disconnect failure during script shutdown.
  }
  process.exit(1);
});
