import { v2 as cloudinary } from "cloudinary";
import { randomUUID } from "crypto";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

import { ApiError } from "../middleware/errorMiddleware.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOCAL_PUBLIC_ID_PREFIX = "local:uploads/";
const localUploadDirectory = path.resolve(__dirname, "../assets/uploads");

const hasCloudinaryConfig = () =>
  Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET,
  );

const isProduction = () => process.env.NODE_ENV === "production";

const canUseLocalAssetStorage = () => {
  const configured = String(process.env.ALLOW_LOCAL_ASSET_STORAGE ?? "").trim().toLowerCase();

  if (configured === "true") {
    return true;
  }

  if (configured === "false") {
    return false;
  }

  return !isProduction();
};

if (hasCloudinaryConfig()) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
} else if (canUseLocalAssetStorage()) {
  console.warn(
    "Cloudinary is not configured. Falling back to local image storage for this environment.",
  );
} else {
  console.warn(
    "Cloudinary is not configured. Product and review image uploads are disabled in production to avoid broken local asset URLs.",
  );
}

const mimeTypeToExtension = (mimeType = "image/jpeg") => {
  const normalized = String(mimeType).toLowerCase();
  if (normalized.includes("png")) return "png";
  if (normalized.includes("webp")) return "webp";
  if (normalized.includes("gif")) return "gif";
  if (normalized.includes("svg")) return "svg";
  if (normalized.includes("avif")) return "avif";
  if (normalized.includes("heic")) return "heic";
  if (normalized.includes("heif")) return "heif";
  return "jpg";
};

const resolveAssetBaseUrl = () => {
  const explicitBaseUrl = process.env.ASSET_BASE_URL?.trim();
  if (explicitBaseUrl) {
    return explicitBaseUrl.replace(/\/+$/, "");
  }

  const renderExternalUrl = process.env.RENDER_EXTERNAL_URL?.trim();
  if (renderExternalUrl) {
    return renderExternalUrl.replace(/\/+$/, "");
  }

  return `http://localhost:${process.env.PORT || 5000}`;
};

const uploadImageToLocalStorage = async (buffer, mimeType = "image/jpeg") => {
  await fs.mkdir(localUploadDirectory, { recursive: true });

  const extension = mimeTypeToExtension(mimeType);
  const fileName = `${Date.now()}-${randomUUID()}.${extension}`;
  const absolutePath = path.join(localUploadDirectory, fileName);

  await fs.writeFile(absolutePath, buffer);

  return {
    imageUrl: `${resolveAssetBaseUrl()}/assets/uploads/${fileName}`,
    publicId: `${LOCAL_PUBLIC_ID_PREFIX}${fileName}`,
  };
};

const assertUploadStorageAvailable = () => {
  if (hasCloudinaryConfig() || canUseLocalAssetStorage()) {
    return;
  }

  throw new ApiError(
    "Image uploads are disabled in production because Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET, then redeploy.",
    503,
  );
};

export const ensureCloudinaryConfigured = () => hasCloudinaryConfig();
export const allowLocalAssetStorage = () => canUseLocalAssetStorage();

export const uploadImageBuffer = async (
  buffer,
  folder = "storesync/products",
  mimeType = "image/jpeg",
) => {
  if (!hasCloudinaryConfig()) {
    assertUploadStorageAvailable();
    return uploadImageToLocalStorage(buffer, mimeType);
  }

  const base64 = `data:${mimeType};base64,${buffer.toString("base64")}`;
  const result = await cloudinary.uploader.upload(base64, { folder, resource_type: "image" });

  return {
    imageUrl: result.secure_url,
    publicId: result.public_id,
  };
};

export const deleteCloudinaryAsset = async (publicId) => {
  if (!publicId) {
    return;
  }

  if (publicId.startsWith(LOCAL_PUBLIC_ID_PREFIX)) {
    const fileName = path.basename(publicId.slice(LOCAL_PUBLIC_ID_PREFIX.length));
    if (!fileName) {
      return;
    }

    const absolutePath = path.join(localUploadDirectory, fileName);

    try {
      await fs.unlink(absolutePath);
    } catch (error) {
      if (error?.code !== "ENOENT") {
        throw error;
      }
    }
    return;
  }

  if (!hasCloudinaryConfig()) {
    return;
  }

  await cloudinary.uploader.destroy(publicId);
};

export default cloudinary;
