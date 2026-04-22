import asyncHandler from "../middleware/asyncHandler.js";
import { ApiError } from "../middleware/errorMiddleware.js";
import PincodeRule from "../models/PincodeRule.js";
import { createAuditLog } from "../utils/auditLog.js";
import {
  ensureObjectId,
  ensurePincode,
  toBoolean,
  toFiniteNumber,
  toSafeString,
} from "../utils/adminUtils.js";
import { buildPaginationMeta, getPagination } from "../utils/pagination.js";

const normalizePincodePayload = (payload = {}, updatedBy) => ({
  pincode: ensurePincode(payload.pincode),
  city: toSafeString(payload.city),
  state: toSafeString(payload.state),
  area: toSafeString(payload.area),
  isServiceable: toBoolean(payload.isServiceable, true),
  codAvailable: toBoolean(payload.codAvailable, true),
  shippingFee: Math.max(0, toFiniteNumber(payload.shippingFee, 0)),
  estimatedDeliveryDays: Math.max(1, Math.min(30, Math.floor(toFiniteNumber(payload.estimatedDeliveryDays, 3)))),
  minOrderAmount: Math.max(0, toFiniteNumber(payload.minOrderAmount, 0)),
  notes: toSafeString(payload.notes),
  updatedBy,
});

export const listPincodeRules = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const query = {};

  if (req.query.search) {
    const search = toSafeString(req.query.search);
    query.$or = [
      { pincode: { $regex: search, $options: "i" } },
      { city: { $regex: search, $options: "i" } },
      { state: { $regex: search, $options: "i" } },
      { area: { $regex: search, $options: "i" } },
    ];
  }

  const [rows, total] = await Promise.all([
    PincodeRule.find(query)
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    PincodeRule.countDocuments(query),
  ]);

  res.status(200).json({
    success: true,
    data: rows,
    pagination: buildPaginationMeta({ page, limit, total }),
  });
});

export const createPincodeRule = asyncHandler(async (req, res) => {
  const payload = normalizePincodePayload(req.body, req.user._id);

  if (!payload.city || !payload.state) {
    throw new ApiError("city and state are required", 400);
  }

  const existing = await PincodeRule.findOne({ pincode: payload.pincode });
  if (existing) {
    throw new ApiError("Pincode rule already exists. Use update endpoint.", 409);
  }

  const rule = await PincodeRule.create(payload);

  await createAuditLog({
    req,
    action: "pincode_rule_created",
    module: "pincode",
    targetType: "PincodeRule",
    targetId: rule._id,
    metadata: {
      pincode: rule.pincode,
      city: rule.city,
      state: rule.state,
      isServiceable: rule.isServiceable,
    },
  });

  res.status(201).json({
    success: true,
    message: "Pincode rule created",
    data: rule,
  });
});

export const updatePincodeRule = asyncHandler(async (req, res) => {
  ensureObjectId(req.params.id, "pincode rule id");

  const rule = await PincodeRule.findById(req.params.id);
  if (!rule) {
    throw new ApiError("Pincode rule not found", 404);
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "pincode")) {
    rule.pincode = ensurePincode(req.body.pincode);
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "city")) {
    rule.city = toSafeString(req.body.city);
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "state")) {
    rule.state = toSafeString(req.body.state);
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "area")) {
    rule.area = toSafeString(req.body.area);
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "isServiceable")) {
    rule.isServiceable = toBoolean(req.body.isServiceable, rule.isServiceable);
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "codAvailable")) {
    rule.codAvailable = toBoolean(req.body.codAvailable, rule.codAvailable);
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "shippingFee")) {
    rule.shippingFee = Math.max(0, toFiniteNumber(req.body.shippingFee, rule.shippingFee));
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "estimatedDeliveryDays")) {
    rule.estimatedDeliveryDays = Math.max(
      1,
      Math.min(30, Math.floor(toFiniteNumber(req.body.estimatedDeliveryDays, rule.estimatedDeliveryDays))),
    );
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "minOrderAmount")) {
    rule.minOrderAmount = Math.max(0, toFiniteNumber(req.body.minOrderAmount, rule.minOrderAmount));
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "notes")) {
    rule.notes = toSafeString(req.body.notes);
  }

  rule.updatedBy = req.user._id;
  await rule.save();

  await createAuditLog({
    req,
    action: "pincode_rule_updated",
    module: "pincode",
    targetType: "PincodeRule",
    targetId: rule._id,
    metadata: {
      pincode: rule.pincode,
      city: rule.city,
      state: rule.state,
      isServiceable: rule.isServiceable,
      codAvailable: rule.codAvailable,
    },
  });

  res.status(200).json({
    success: true,
    message: "Pincode rule updated",
    data: rule,
  });
});

export const checkPincode = asyncHandler(async (req, res) => {
  const pincode = ensurePincode(req.params.pincode);
  const rule = await PincodeRule.findOne({ pincode }).lean();

  res.status(200).json({
    success: true,
    data: {
      pincode,
      isKnown: Boolean(rule),
      isServiceable: Boolean(rule?.isServiceable),
      codAvailable: Boolean(rule?.codAvailable),
      city: rule?.city || "",
      state: rule?.state || "",
      area: rule?.area || "",
      shippingFee: Number(rule?.shippingFee || 0),
      estimatedDeliveryDays: Number(rule?.estimatedDeliveryDays || 0),
      minOrderAmount: Number(rule?.minOrderAmount || 0),
      notes: rule?.notes || "",
      apiReady: true,
    },
  });
});
