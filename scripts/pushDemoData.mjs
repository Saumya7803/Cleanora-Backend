import dotenv from "dotenv";
import mongoose from "mongoose";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const defaultMongoUri = "mongodb://127.0.0.1:27017/storesync";
const mongoUri = process.env.MONGO_URI || defaultMongoUri;

const run = async () => {
  await mongoose.connect(mongoUri);

  const db = mongoose.connection.db;
  const users = db.collection("users");
  const products = db.collection("products");

  const owner =
    (await users.findOne(
      { role: { $in: ["admin", "super_admin"] } },
      { projection: { _id: 1, email: 1 } },
    )) ||
    (await users.findOne({}, { projection: { _id: 1, email: 1 } }));

  if (!owner?._id) {
    throw new Error("No user account found to assign product ownership.");
  }

  const batchId = Date.now();
  const now = new Date();

  const demoProducts = [
    {
      name: `Demo Blender Pro ${batchId}`,
      description: "High-speed blender with pulse mode and stainless steel jar.",
      price: 5499,
      category: "Kitchen Appliances",
      stock: 14,
      imageUrl: "https://picsum.photos/seed/cleanora-demo-blender/1200/1200.jpg",
      cloudinaryPublicId: "",
      isActive: true,
      createdBy: owner._id,
      createdAt: now,
      updatedAt: now,
    },
    {
      name: `Demo Smart Oven ${batchId}`,
      description: "Compact smart oven with app controls and quick preheat.",
      price: 18999,
      category: "Kitchen Appliances",
      stock: 7,
      imageUrl: "https://picsum.photos/seed/cleanora-demo-oven/1200/1200.jpg",
      cloudinaryPublicId: "",
      isActive: true,
      createdBy: owner._id,
      createdAt: now,
      updatedAt: now,
    },
    {
      name: `Demo Air Purifier ${batchId}`,
      description: "Quiet HEPA purifier with PM2.5 display and auto mode.",
      price: 12999,
      category: "Air Care",
      stock: 11,
      imageUrl: "https://picsum.photos/seed/cleanora-demo-purifier/1200/1200.jpg",
      cloudinaryPublicId: "",
      isActive: true,
      createdBy: owner._id,
      createdAt: now,
      updatedAt: now,
    },
  ];

  const result = await products.insertMany(demoProducts);
  const totalProducts = await products.countDocuments({});

  console.log(
    JSON.stringify(
      {
        ownerEmail: owner.email || null,
        insertedProducts: Object.keys(result.insertedIds).length,
        totalProducts,
      },
      null,
      2,
    ),
  );

  await mongoose.disconnect();
};

run().catch(async (error) => {
  console.error("Demo data push failed:", error.message);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore disconnect errors
  }
  process.exit(1);
});
