import asyncHandler from "../middleware/asyncHandler.js";
import { ApiError } from "../middleware/errorMiddleware.js";
import FraudCase from "../models/FraudCase.js";
import FraudRule from "../models/FraudRule.js";
import Order from "../models/Order.js";
import { createAuditLog } from "../utils/auditLog.js";
import { ensureObjectId, normalizePincode, toArrayOfStrings, toBoolean, toFiniteNumber, toSafeString } from "../utils/adminUtils.js";
import { buildPaginationMeta, getPagination } from "../utils/pagination.js";
import { ORDER_STATUSES } from "../utils/orderStatus.js";

const toFraudSeverity = (score) => {
  if (score >= 80) {
    return "critical";
  }
  if (score >= 60) {
    return "high";
  }
  if (score >= 35) {
    return "medium";
  }
  return "low";
};

const evaluateFraudRules = async ({ order, rules }) => {
  const matches = [];

  for (const rule of rules) {
    if (!rule.enabled) {
      continue;
    }

    const weight = Math.max(1, Math.min(100, Number(rule.weight) || 25));
    let matched = false;
    let reason = "";

    if (rule.type === "max_order_amount") {
      const maxAmount = Math.max(0, Number(rule.config?.maxAmount) || 5000);
      if (Number(order.totalAmount || 0) > maxAmount) {
        matched = true;
        reason = `Order amount ${order.totalAmount} is above ${maxAmount}`;
      }
    }

    if (rule.type === "blocked_pincode") {
      const blockedPincodes = toArrayOfStrings(rule.config?.pincodes).map(normalizePincode);
      const orderPincode = normalizePincode(order.address?.postalCode);
      if (orderPincode && blockedPincodes.includes(orderPincode)) {
        matched = true;
        reason = `Order pincode ${orderPincode} is blocked`;
      }
    }

    if (rule.type === "high_frequency_orders") {
      const hours = Math.max(1, Number(rule.config?.windowHours) || 24);
      const maxOrders = Math.max(1, Number(rule.config?.maxOrders) || 4);
      const fromDate = new Date(Date.now() - hours * 60 * 60 * 1000);
      const recentOrderCount = await Order.countDocuments({
        user: order.user,
        createdAt: { $gte: fromDate },
      });
      if (recentOrderCount > maxOrders) {
        matched = true;
        reason = `${recentOrderCount} orders in the last ${hours}h`;
      }
    }

    if (rule.type === "coupon_abuse") {
      const couponCode = toSafeString(order.couponCode).toUpperCase();
      if (couponCode) {
        const lookbackDays = Math.max(1, Number(rule.config?.lookbackDays) || 30);
        const maxUsage = Math.max(1, Number(rule.config?.maxUsage) || 3);
        const fromDate = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
        const usageCount = await Order.countDocuments({
          user: order.user,
          couponCode,
          createdAt: { $gte: fromDate },
          status: { $nin: [ORDER_STATUSES.CANCELLED] },
        });

        if (usageCount > maxUsage) {
          matched = true;
          reason = `Coupon ${couponCode} used ${usageCount} times in ${lookbackDays} days`;
        }
      }
    }

    if (rule.type === "cod_risk") {
      const maxCodAmount = Math.max(0, Number(rule.config?.maxCodAmount) || 3000);
      const isCod = String(order.payment?.method || order.paymentMethod || "") === "cash_on_delivery";
      if (isCod && Number(order.totalAmount || 0) > maxCodAmount) {
        matched = true;
        reason = `COD order amount ${order.totalAmount} is above ${maxCodAmount}`;
      }
    }

    if (!matched) {
      continue;
    }

    matches.push({
      rule: rule._id,
      name: rule.name,
      type: rule.type,
      score: weight,
      reason,
      action: rule.action,
    });
  }

  const riskScore = Math.min(100, matches.reduce((sum, item) => sum + Number(item.score || 0), 0));

  return {
    matchedRules: matches,
    riskScore,
    severity: toFraudSeverity(riskScore),
  };
};

export const listFraudRules = asyncHandler(async (_req, res) => {
  const rules = await FraudRule.find({}).sort({ updatedAt: -1 }).lean();

  res.status(200).json({
    success: true,
    data: rules,
  });
});

export const createFraudRule = asyncHandler(async (req, res) => {
  const name = toSafeString(req.body.name);
  const type = toSafeString(req.body.type);

  if (!name || !type) {
    throw new ApiError("name and type are required", 400);
  }

  const rule = await FraudRule.create({
    name,
    type,
    enabled: toBoolean(req.body.enabled, true),
    weight: Math.max(1, Math.min(100, Math.floor(toFiniteNumber(req.body.weight, 25)))),
    action: ["flag", "hold", "block"].includes(toSafeString(req.body.action))
      ? toSafeString(req.body.action)
      : "flag",
    config: req.body.config && typeof req.body.config === "object" ? req.body.config : {},
    updatedBy: req.user._id,
  });

  await createAuditLog({
    req,
    action: "fraud_rule_created",
    module: "fraud",
    targetType: "FraudRule",
    targetId: rule._id,
    metadata: {
      type: rule.type,
      weight: rule.weight,
      action: rule.action,
    },
  });

  res.status(201).json({
    success: true,
    message: "Fraud rule created",
    data: rule,
  });
});

export const updateFraudRule = asyncHandler(async (req, res) => {
  ensureObjectId(req.params.id, "fraud rule id");

  const rule = await FraudRule.findById(req.params.id);
  if (!rule) {
    throw new ApiError("Fraud rule not found", 404);
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "name")) {
    rule.name = toSafeString(req.body.name);
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "enabled")) {
    rule.enabled = toBoolean(req.body.enabled, rule.enabled);
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "weight")) {
    rule.weight = Math.max(1, Math.min(100, Math.floor(toFiniteNumber(req.body.weight, rule.weight))));
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "action")) {
    const action = toSafeString(req.body.action);
    if (!["flag", "hold", "block"].includes(action)) {
      throw new ApiError("Invalid fraud rule action", 400);
    }
    rule.action = action;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "config")) {
    rule.config = req.body.config && typeof req.body.config === "object" ? req.body.config : {};
  }

  rule.updatedBy = req.user._id;
  await rule.save();

  await createAuditLog({
    req,
    action: "fraud_rule_updated",
    module: "fraud",
    targetType: "FraudRule",
    targetId: rule._id,
    metadata: {
      enabled: rule.enabled,
      weight: rule.weight,
      action: rule.action,
    },
  });

  res.status(200).json({
    success: true,
    message: "Fraud rule updated",
    data: rule,
  });
});

export const listFraudCases = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const query = {};

  if (req.query.status) {
    query.status = toSafeString(req.query.status);
  }

  if (req.query.severity) {
    query.severity = toSafeString(req.query.severity);
  }

  const [cases, total] = await Promise.all([
    FraudCase.find(query)
      .populate("order", "status totalAmount createdAt address postalCode payment")
      .populate("user", "name email phone")
      .populate("reviewedBy", "name email")
      .sort({ riskScore: -1, updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    FraudCase.countDocuments(query),
  ]);

  res.status(200).json({
    success: true,
    data: cases,
    pagination: buildPaginationMeta({ page, limit, total }),
  });
});

export const scanOrderForFraud = asyncHandler(async (req, res) => {
  ensureObjectId(req.params.orderId, "order id");

  const order = await Order.findById(req.params.orderId).lean();
  if (!order) {
    throw new ApiError("Order not found", 404);
  }

  const rules = await FraudRule.find({ enabled: true }).lean();
  const evaluation = await evaluateFraudRules({ order, rules });
  const hasRiskSignals = evaluation.matchedRules.length > 0;

  const updatedFraudCase = await FraudCase.findOneAndUpdate(
    { order: order._id },
    {
      $set: {
        user: order.user,
        riskScore: evaluation.riskScore,
        severity: evaluation.severity,
        matchedRules: evaluation.matchedRules,
        status: hasRiskSignals ? "open" : "approved",
        reviewedBy: null,
        reviewedAt: null,
      },
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    },
  )
    .populate("order", "status totalAmount createdAt address payment couponCode")
    .populate("user", "name email phone")
    .lean();

  await createAuditLog({
    req,
    action: "fraud_order_scanned",
    module: "fraud",
    targetType: "Order",
    targetId: order._id,
    metadata: {
      riskScore: evaluation.riskScore,
      severity: evaluation.severity,
      matchedRules: evaluation.matchedRules.map((rule) => rule.type),
    },
  });

  res.status(200).json({
    success: true,
    message: hasRiskSignals ? "Order flagged for risk review" : "No fraud signal found",
    data: updatedFraudCase,
  });
});

export const updateFraudCase = asyncHandler(async (req, res) => {
  ensureObjectId(req.params.id, "fraud case id");

  const fraudCase = await FraudCase.findById(req.params.id);
  if (!fraudCase) {
    throw new ApiError("Fraud case not found", 404);
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "status")) {
    const status = toSafeString(req.body.status);
    if (!["open", "investigating", "approved", "blocked", "resolved"].includes(status)) {
      throw new ApiError("Invalid fraud case status", 400);
    }
    fraudCase.status = status;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "notes")) {
    fraudCase.notes = toSafeString(req.body.notes);
  }

  fraudCase.reviewedBy = req.user._id;
  fraudCase.reviewedAt = new Date();

  await fraudCase.save();

  await createAuditLog({
    req,
    action: "fraud_case_updated",
    module: "fraud",
    targetType: "FraudCase",
    targetId: fraudCase._id,
    metadata: {
      status: fraudCase.status,
      riskScore: fraudCase.riskScore,
    },
  });

  res.status(200).json({
    success: true,
    message: "Fraud case updated",
    data: fraudCase,
  });
});
