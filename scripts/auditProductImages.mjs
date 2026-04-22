import dotenv from "dotenv";
import mongoose from "mongoose";
import path from "path";
import { fileURLToPath } from "url";

import Product from "../models/Product.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const args = new Set(process.argv.slice(2));
const inspectAllUrls = args.has("--all");
const printJson = args.has("--json");

const isLocalUploadUrl = (value) =>
  typeof value === "string" && /\/assets\/uploads\//i.test(value);

const collectCandidateUrls = (product) => {
  const imageEntries = Array.isArray(product.images)
    ? product.images
        .filter((image) => image && typeof image.url === "string" && image.url.trim())
        .map((image) => ({
          url: image.url.trim(),
          publicId: typeof image.publicId === "string" ? image.publicId.trim() : "",
        }))
    : [];

  const unique = new Map();
  for (const entry of imageEntries) {
    unique.set(entry.url, entry);
  }

  if (typeof product.imageUrl === "string" && product.imageUrl.trim()) {
    unique.set(product.imageUrl.trim(), {
      url: product.imageUrl.trim(),
      publicId:
        typeof product.cloudinaryPublicId === "string"
          ? product.cloudinaryPublicId.trim()
          : "",
    });
  }

  const urls = [...unique.values()];
  return inspectAllUrls ? urls : urls.filter((entry) => isLocalUploadUrl(entry.url));
};

const probeUrl = async (url) => {
  try {
    let response = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
    });

    if (response.status === 405) {
      response = await fetch(url, {
        method: "GET",
        redirect: "follow",
      });
    }

    return {
      ok: response.ok,
      status: response.status,
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      error: error instanceof Error ? error.message : "Unknown request error",
    };
  }
};

const run = async () => {
  const mongoUri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/storesync";
  await mongoose.connect(mongoUri);

  const products = await Product.find({})
    .select("name imageUrl images cloudinaryPublicId")
    .lean();

  const findings = [];
  for (const product of products) {
    const urls = collectCandidateUrls(product);

    for (const entry of urls) {
      const result = await probeUrl(entry.url);
      findings.push({
        productId: String(product._id),
        productName: product.name,
        url: entry.url,
        publicId: entry.publicId,
        isLocalUpload: isLocalUploadUrl(entry.url),
        ok: result.ok,
        status: result.status,
        error: result.error || "",
      });
    }
  }

  const broken = findings.filter((item) => !item.ok);
  const summary = {
    scannedProducts: products.length,
    scannedUrls: findings.length,
    brokenUrls: broken.length,
    mode: inspectAllUrls ? "all" : "local-uploads-only",
  };

  if (printJson) {
    console.log(JSON.stringify({ summary, broken }, null, 2));
  } else {
    console.log(`Scanned ${summary.scannedUrls} image URL(s) across ${summary.scannedProducts} product(s).`);
    console.log(`Mode: ${summary.mode}`);
    console.log(`Broken URLs: ${summary.brokenUrls}`);

    for (const item of broken) {
      const statusLabel = item.status ?? item.error ?? "request failed";
      console.log(
        `- ${item.productName} (${item.productId}) -> ${item.url} [${statusLabel}]`,
      );
    }
  }

  await mongoose.disconnect();

  if (broken.length > 0) {
    process.exitCode = 1;
  }
};

run().catch(async (error) => {
  console.error("Product image audit failed:", error);

  try {
    await mongoose.disconnect();
  } catch {
    // Ignore disconnect failure during shutdown.
  }

  process.exit(1);
});
