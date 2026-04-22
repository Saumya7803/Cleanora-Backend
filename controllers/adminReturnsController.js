import asyncHandler from "../middleware/asyncHandler.js";
import { ApiError } from "../middleware/errorMiddleware.js";
import Order from "../models/Order.js";
import Product from "../models/Product.js";
import { createAuditLog } from "../utils/auditLog.js";
import { ensureObjectId, toSafeString } from "../utils/adminUtils.js";
import { buildPaginationMeta, getPagination } from "../utils/pagination.js";
import { ORDER_STATUSES, toStatusLabel } from "../utils/orderStatus.js";

const restoreStock = async (items = []) =>
  Promise.all(
    items.map((item) =>
      Product.updateOne({ _id: item.product }, { $inc: { stock: Number(item.quantity) || 0 } }),
    ),
  );

const toReturnRequestSummary = (order) => ({
  _id: order._id,
  orderId: order._id,
  status: order.status,
  statusLabel: toStatusLabel(order.status),
  totalAmount: order.totalAmount,
  paymentStatus: order.payment?.status,
  user: order.user,
  returnRequest: order.returnRequest,
  createdAt: order.createdAt,
  updatedAt: order.updatedAt,
});

export const listReturnRequests = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const query = {
    "returnRequest.requested": true,
  };

  if (req.query.status) {
    query["returnRequest.status"] = toSafeString(req.query.status);
  }

  const [orders, total] = await Promise.all([
    Order.find(query)
      .populate("user", "name email phone")
      .sort({ "returnRequest.requestedAt": -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Order.countDocuments(query),
  ]);

  res.status(200).json({
    success: true,
    data: orders.map(toReturnRequestSummary),
    pagination: buildPaginationMeta({ page, limit, total }),
  });
});

export const reviewReturnRequest = asyncHandler(async (req, res) => {
  ensureObjectId(req.params.orderId, "order id");

  const decision = toSafeString(req.body.decision).toLowerCase();
  if (!["approved", "rejected"].includes(decision)) {
    throw new ApiError("decision must be approved or rejected", 400);
  }

  const order = await Order.findById(req.params.orderId);
  if (!order) {
    throw new ApiError("Order not found", 404);
  }

  if (!order.returnRequest?.requested) {
    throw new ApiError("No return request found for this order", 400);
  }

  const resolutionNote = toSafeString(req.body.resolutionNote);

  if (decision === "approved") {
    order.returnRequest.status = "approved";
    order.returnRequest.resolutionNote = resolutionNote || "Return approved by admin";
    order.returnRequest.refundStatus = "processing";
    order.status = ORDER_STATUSES.RETURN_REQUESTED;
    order.statusTimeline.push({
      status: ORDER_STATUSES.RETURN_REQUESTED,
      note: order.returnRequest.resolutionNote,
      updatedBy: req.user._id,
    });
  } else {
    order.returnRequest.status = "rejected";
    order.returnRequest.resolutionNote = resolutionNote || "Return rejected by admin";
    order.returnRequest.refundStatus = "not_initiated";
    order.status = ORDER_STATUSES.DELIVERED;
    order.statusTimeline.push({
      status: ORDER_STATUSES.DELIVERED,
      note: order.returnRequest.resolutionNote,
      updatedBy: req.user._id,
    });
  }

  await order.save();

  await createAuditLog({
    req,
    action: "return_request_reviewed",
    module: "returns",
    targetType: "Order",
    targetId: order._id,
    metadata: {
      decision,
      note: order.returnRequest.resolutionNote,
      refundStatus: order.returnRequest.refundStatus,
    },
  });

  const populated = await Order.findById(order._id)
    .populate("user", "name email phone")
    .lean();

  res.status(200).json({
    success: true,
    message: `Return request ${decision}`,
    data: toReturnRequestSummary(populated),
  });
});

export const updateReturnRefundStatus = asyncHandler(async (req, res) => {
  ensureObjectId(req.params.orderId, "order id");

  const refundStatus = toSafeString(req.body.refundStatus).toLowerCase();
  if (!["not_initiated", "processing", "completed", "failed"].includes(refundStatus)) {
    throw new ApiError("refundStatus must be not_initiated, processing, completed, or failed", 400);
  }

  const order = await Order.findById(req.params.orderId);
  if (!order) {
    throw new ApiError("Order not found", 404);
  }

  if (!order.returnRequest?.requested) {
    throw new ApiError("No return request found for this order", 400);
  }

  order.returnRequest.refundStatus = refundStatus;
  order.returnRequest.refundTransactionId = toSafeString(req.body.refundTransactionId);
  order.returnRequest.refundUpdatedAt = new Date();

  if (refundStatus === "completed") {
    order.returnRequest.refundedAt = new Date();
    order.status = ORDER_STATUSES.RETURNED;
    if (order.payment?.status === "success") {
      order.payment.status = "refunded";
    }
    order.statusTimeline.push({
      status: ORDER_STATUSES.RETURNED,
      note: "Return completed and refund processed",
      updatedBy: req.user._id,
    });
    await restoreStock(order.items);
  }

  if (refundStatus === "failed") {
    order.statusTimeline.push({
      status: order.status,
      note: "Refund processing failed. Manual review required.",
      updatedBy: req.user._id,
    });
  }

  await order.save();

  await createAuditLog({
    req,
    action: "return_refund_status_updated",
    module: "returns",
    targetType: "Order",
    targetId: order._id,
    metadata: {
      refundStatus,
      refundTransactionId: order.returnRequest.refundTransactionId,
      orderStatus: order.status,
    },
  });

  const populated = await Order.findById(order._id)
    .populate("user", "name email phone")
    .lean();

  res.status(200).json({
    success: true,
    message: "Refund status updated",
    data: toReturnRequestSummary(populated),
  });
});
