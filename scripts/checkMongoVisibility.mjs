import dotenv from "dotenv";
import mongoose from "mongoose";
import path from "path";
import { fileURLToPath } from "url";

const shouldSeedMarker = process.argv.includes("--seed-marker");
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const run = async () => {
  const uri = process.env.MONGO_URI;

  if (!uri) {
    throw new Error("MONGO_URI is missing in backend/.env");
  }

  await mongoose.connect(uri);

  const db = mongoose.connection.db;
  const dbName = db.databaseName;
  const collections = await db.listCollections().toArray();

  console.log(`URI: ${uri}`);
  console.log(`DB name: ${dbName}`);
  console.log(
    `Collections: ${collections.length ? collections.map((c) => c.name).join(", ") : "(none)"}`,
  );

  if (shouldSeedMarker) {
    const markerCollection = db.collection("compass_check");

    await markerCollection.updateOne(
      { key: "compass-visible" },
      {
        $set: {
          key: "compass-visible",
          note: "Created to make DB visible in Compass",
          updatedAt: new Date(),
        },
      },
      { upsert: true },
    );

    console.log("Marker document upserted in collection: compass_check");
  }

  await mongoose.disconnect();
};

run().catch(async (error) => {
  console.error("Mongo visibility check failed:", error.message);

  try {
    await mongoose.disconnect();
  } catch {
    // no-op
  }

  process.exit(1);
});
