import mongoose from "mongoose";

const toPositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const connectDatabase = async () => {
  const mongoUri = process.env.MONGO_URI;

  if (!mongoUri) {
    throw new Error("MONGO_URI is missing. Add it to your .env file.");
  }

  const maxPoolSize = toPositiveInt(process.env.DB_MAX_POOL_SIZE, 100);
  const minPoolSize = Math.min(
    maxPoolSize,
    toPositiveInt(process.env.DB_MIN_POOL_SIZE, 5),
  );

  const connection = await mongoose.connect(mongoUri, {
    maxPoolSize,
    minPoolSize,
    maxConnecting: toPositiveInt(process.env.DB_MAX_CONNECTING, 8),
    serverSelectionTimeoutMS: toPositiveInt(
      process.env.DB_SERVER_SELECTION_TIMEOUT_MS,
      10_000,
    ),
    socketTimeoutMS: toPositiveInt(process.env.DB_SOCKET_TIMEOUT_MS, 45_000),
    retryWrites: true,
  });
  console.log(`MongoDB connected: ${connection.connection.host}`);
};

export default connectDatabase;
