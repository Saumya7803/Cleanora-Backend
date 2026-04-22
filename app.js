import cors from "cors";
import express from "express";
import morgan from "morgan";
import path from "path";
import { fileURLToPath } from "url";

import adminRoutes from "./routes/adminRoutes.js";
import addressRoutes from "./routes/addressRoutes.js";
import analyticsRoutes from "./routes/analyticsRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import bannerRoutes from "./routes/bannerRoutes.js";
import cartRoutes from "./routes/cartRoutes.js";
import couponRoutes from "./routes/couponRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import orderRoutes from "./routes/orderRoutes.js";
import pincodeRoutes from "./routes/pincodeRoutes.js";
import productRoutes from "./routes/productRoutes.js";
import supportRoutes from "./routes/supportRoutes.js";
import wishlistRoutes from "./routes/wishlistRoutes.js";
import { ApiError, errorHandler, notFound } from "./middleware/errorMiddleware.js";
import { trafficControl } from "./middleware/trafficControl.js";

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.set("etag", false);

const parseAllowedOrigins = () => {
  const configured = process.env.CORS_ORIGINS?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (configured?.length) {
    return configured;
  }

  return ["http://localhost:5173", "http://localhost:3000"];
};

const isLocalDevOrigin = (origin) => {
  try {
    const parsed = new URL(origin);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }

    return parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  } catch {
    return false;
  }
};

const allowedOrigins = parseAllowedOrigins();
const enableHttpAccessLogs =
  process.env.NODE_ENV !== "test" && process.env.HTTP_ACCESS_LOGS !== "false";

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      if (process.env.NODE_ENV !== "production" && isLocalDevOrigin(origin)) {
        return callback(null, true);
      }

      return callback(new ApiError(`CORS blocked for origin: ${origin}`, 403));
    },
    credentials: true,
  }),
);

app.use(trafficControl);

if (enableHttpAccessLogs) {
  app.use(morgan("dev"));
}

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use("/assets", express.static(path.join(__dirname, "assets")));

app.get("/api/health", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "StoreSync API is healthy",
    timestamp: new Date().toISOString(),
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/addresses", addressRoutes);
app.use("/api/wishlist", wishlistRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/coupons", couponRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/support", supportRoutes);
app.use("/api/pincodes", pincodeRoutes);
app.use("/api/banners", bannerRoutes);
app.use("/api/admin", adminRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
