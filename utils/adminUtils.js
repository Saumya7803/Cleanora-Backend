import mongoose from "mongoose";

import { ApiError } from "../middleware/errorMiddleware.js";

export const ensureObjectId = (value, label) => {
  if (!mongoose.isValidObjectId(value)) {
    throw new ApiError(`Invalid ${label}`, 400);
  }
};

export const toSafeString = (value) => String(value || "").trim();

export const toArrayOfStrings = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map((item) => String(item || "").trim())
        .filter(Boolean),
    ),
  );
};

export const toDateOrNull = (value) => {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
};

export const toFiniteNumber = (value, fallback = 0) => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
};

export const toBoolean = (value, fallback = false) => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") {
      return true;
    }
    if (normalized === "false") {
      return false;
    }
  }

  return fallback;
};

export const normalizePincode = (value) => String(value || "").replace(/\D/g, "").slice(0, 6);

export const ensurePincode = (value) => {
  const pincode = normalizePincode(value);
  if (!/^\d{6}$/.test(pincode)) {
    throw new ApiError("Pincode must be a 6-digit number", 400);
  }
  return pincode;
};
