import asyncHandler from "../middleware/asyncHandler.js";
import { ApiError } from "../middleware/errorMiddleware.js";
import InventoryAlert from "../models/InventoryAlert.js";
import InventoryRule from "../models/InventoryRule.js";
import Product from "../models/Product.js";
import { createAuditLog } from "../utils/auditLog.js";
import { ensureObjectId, toBoolean, toFiniteNumber, toSafeString } from "../utils/adminUtils.js";

export const listInventoryRules = asyncHandler(async (_req, res) => {
  const rules = await InventoryRule.find({})
    .populate("product", "name category stock imageUrl")
    .sort({ updatedAt: -1 })
    .lean();

  res.status(200).json({
    success: true,
    data: rules,
  });
});

export const upsertInventoryRule = asyncHandler(async (req, res) => {
  const { productId, threshold, enabled } = req.body;
  ensureObjectId(productId, "product id");

  const product = await Product.findById(productId).lean();
  if (!product) {
    throw new ApiError("Product not found", 404);
  }

  const sanitizedThreshold = Math.max(0, Math.floor(toFiniteNumber(threshold, 10)));
  const rule = await InventoryRule.findOneAndUpdate(
    { product: productId },
    {
      $set: {
        threshold: sanitizedThreshold,
        enabled: toBoolean(enabled, true),
        updatedBy: req.user._id,
      },
      $setOnInsert: {
        createdBy: req.user._id,
      },
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    },
  ).populate("product", "name category stock imageUrl");

  await createAuditLog({
    req,
    action: "inventory_rule_upserted",
    module: "inventory",
    targetType: "InventoryRule",
    targetId: rule._id,
    metadata: {
      productId,
      threshold: rule.threshold,
      enabled: rule.enabled,
    },
  });

  res.status(200).json({
    success: true,
    message: "Inventory rule saved",
    data: rule,
  });
});

export const scanInventoryAlerts = asyncHandler(async (req, res) => {
  const defaultThreshold = Math.max(0, Math.floor(toFiniteNumber(req.body.defaultThreshold, 10)));

  const [products, rules] = await Promise.all([
    Product.find({ isActive: true }).select("_id name stock category imageUrl").lean(),
    InventoryRule.find({ enabled: true }).lean(),
  ]);

  const ruleByProduct = new Map(rules.map((rule) => [String(rule.product), rule]));

  let triggered = 0;
  let updated = 0;
  let resolved = 0;

  for (const product of products) {
    const rule = ruleByProduct.get(String(product._id));
    const threshold = Math.max(0, Number(rule?.threshold ?? defaultThreshold));
    const isLowStock = Number(product.stock || 0) <= threshold;

    if (isLowStock) {
      const existingActive = await InventoryAlert.findOne({
        product: product._id,
        status: "active",
      });

      if (existingActive) {
        existingActive.currentStock = Number(product.stock || 0);
        existingActive.threshold = threshold;
        existingActive.rule = rule?._id || null;
        await existingActive.save();
        updated += 1;
      } else {
        await InventoryAlert.create({
          product: product._id,
          rule: rule?._id || null,
          currentStock: Number(product.stock || 0),
          threshold,
          status: "active",
          triggeredAt: new Date(),
        });
        triggered += 1;
      }
      continue;
    }

    const result = await InventoryAlert.updateMany(
      {
        product: product._id,
        status: "active",
      },
      {
        $set: {
          status: "resolved",
          note: "Auto-resolved after stock replenishment",
          resolvedAt: new Date(),
          resolvedBy: req.user._id,
          currentStock: Number(product.stock || 0),
        },
      },
    );

    resolved += result.modifiedCount || 0;
  }

  await createAuditLog({
    req,
    action: "inventory_scanned",
    module: "inventory",
    targetType: "InventoryAlert",
    targetId: "bulk",
    metadata: {
      defaultThreshold,
      triggered,
      updated,
      resolved,
      scannedProducts: products.length,
    },
  });

  res.status(200).json({
    success: true,
    message: "Inventory scan completed",
    data: {
      scannedProducts: products.length,
      triggered,
      updated,
      resolved,
    },
  });
});

export const listInventoryAlerts = asyncHandler(async (req, res) => {
  const statusFilter = toSafeString(req.query.status);
  const query = {};

  if (["active", "resolved", "ignored"].includes(statusFilter)) {
    query.status = statusFilter;
  }

  const alerts = await InventoryAlert.find(query)
    .populate("product", "name category stock imageUrl")
    .populate("rule", "threshold enabled")
    .populate("resolvedBy", "name email")
    .sort({ status: 1, triggeredAt: -1 })
    .lean();

  res.status(200).json({
    success: true,
    data: alerts,
  });
});

export const resolveInventoryAlert = asyncHandler(async (req, res) => {
  ensureObjectId(req.params.id, "inventory alert id");

  const alert = await InventoryAlert.findById(req.params.id);
  if (!alert) {
    throw new ApiError("Inventory alert not found", 404);
  }

  const status = toSafeString(req.body.status || "resolved");
  if (!["resolved", "ignored", "active"].includes(status)) {
    throw new ApiError("status must be resolved, ignored, or active", 400);
  }

  alert.status = status;
  alert.note = toSafeString(req.body.note);
  if (status === "active") {
    alert.resolvedAt = null;
    alert.resolvedBy = null;
  } else {
    alert.resolvedAt = new Date();
    alert.resolvedBy = req.user._id;
  }

  await alert.save();

  await createAuditLog({
    req,
    action: "inventory_alert_updated",
    module: "inventory",
    targetType: "InventoryAlert",
    targetId: alert._id,
    metadata: {
      status: alert.status,
      note: alert.note,
    },
  });

  res.status(200).json({
    success: true,
    message: "Inventory alert updated",
    data: alert,
  });
});
