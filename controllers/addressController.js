import mongoose from "mongoose";

import Address from "../models/Address.js";
import asyncHandler from "../middleware/asyncHandler.js";
import { ApiError } from "../middleware/errorMiddleware.js";

const ensureObjectId = (value, label) => {
  if (!mongoose.isValidObjectId(value)) {
    throw new ApiError(`Invalid ${label}`, 400);
  }
};

const assertAddressOwnership = async (addressId, userId) => {
  const address = await Address.findById(addressId);
  if (!address) {
    throw new ApiError("Address not found", 404);
  }

  if (String(address.user) !== String(userId)) {
    throw new ApiError("Not authorized to modify this address", 403);
  }

  return address;
};

const normalizeAddressPayload = (body) => ({
  fullName: String(body.fullName || "").trim(),
  phone: String(body.phone || "").trim(),
  line1: String(body.line1 || "").trim(),
  line2: String(body.line2 || "").trim(),
  landmark: String(body.landmark || "").trim(),
  city: String(body.city || "").trim(),
  state: String(body.state || "").trim(),
  postalCode: String(body.postalCode || "").trim(),
  country: String(body.country || "India").trim(),
  label: String(body.label || "Home").trim(),
  isDefault: Boolean(body.isDefault),
});

const clearDefaultAddress = async (userId, exceptId = null) => {
  const query = { user: userId, isDefault: true };
  if (exceptId) {
    query._id = { $ne: exceptId };
  }
  await Address.updateMany(query, { isDefault: false });
};

export const getMyAddresses = asyncHandler(async (req, res) => {
  const addresses = await Address.find({ user: req.user._id }).sort({ isDefault: -1, createdAt: -1 }).lean();

  res.status(200).json({
    success: true,
    data: addresses,
  });
});

export const createAddress = asyncHandler(async (req, res) => {
  const payload = normalizeAddressPayload(req.body);
  if (!payload.fullName || !payload.phone || !payload.line1 || !payload.city || !payload.state || !payload.postalCode) {
    throw new ApiError("fullName, phone, line1, city, state, and postalCode are required", 400);
  }

  const hasExistingAddresses = await Address.exists({ user: req.user._id });
  if (!hasExistingAddresses) {
    payload.isDefault = true;
  }

  if (payload.isDefault) {
    await clearDefaultAddress(req.user._id);
  }

  const address = await Address.create({
    ...payload,
    user: req.user._id,
  });

  res.status(201).json({
    success: true,
    message: "Address added",
    data: address,
  });
});

export const updateAddress = asyncHandler(async (req, res) => {
  ensureObjectId(req.params.id, "address id");
  const address = await assertAddressOwnership(req.params.id, req.user._id);
  const payload = normalizeAddressPayload(req.body);

  if (payload.isDefault) {
    await clearDefaultAddress(req.user._id, address._id);
  }

  Object.assign(address, payload);
  await address.save();

  res.status(200).json({
    success: true,
    message: "Address updated",
    data: address,
  });
});

export const deleteAddress = asyncHandler(async (req, res) => {
  ensureObjectId(req.params.id, "address id");
  const address = await assertAddressOwnership(req.params.id, req.user._id);
  const wasDefault = address.isDefault;

  await address.deleteOne();

  if (wasDefault) {
    const latestAddress = await Address.findOne({ user: req.user._id }).sort({ createdAt: -1 });
    if (latestAddress) {
      latestAddress.isDefault = true;
      await latestAddress.save();
    }
  }

  res.status(200).json({
    success: true,
    message: "Address deleted",
  });
});

export const setDefaultAddress = asyncHandler(async (req, res) => {
  ensureObjectId(req.params.id, "address id");
  const address = await assertAddressOwnership(req.params.id, req.user._id);

  await clearDefaultAddress(req.user._id, address._id);
  address.isDefault = true;
  await address.save();

  res.status(200).json({
    success: true,
    message: "Default address updated",
    data: address,
  });
});
