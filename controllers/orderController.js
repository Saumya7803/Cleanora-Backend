import mongoose from "mongoose";

import Address from "../models/Address.js";
import Cart from "../models/Cart.js";
import Coupon from "../models/Coupon.js";
import Order from "../models/Order.js";
import Product from "../models/Product.js";
import asyncHandler from "../middleware/asyncHandler.js";
import { ApiError } from "../middleware/errorMiddleware.js";
import { createOrderUpdateNotification } from "../services/notificationService.js";
import { canTransitionOrderStatus, ORDER_STATUSES, toStatusLabel } from "../utils/orderStatus.js";
import {
  calculateCouponDiscount,
  calculateTotals,
  normalizeCouponCode,
} from "../utils/pricing.js";
import { buildPaginationMeta, getPagination } from "../utils/pagination.js";

const ensureObjectId = (value, label) => {
  if (!mongoose.isValidObjectId(value)) {
    throw new ApiError(`Invalid ${label}`, 400);
  }
};

const isElevatedRole = (role) => {
  const normalized = String(role || "").trim().toLowerCase();
  return normalized === "admin" || normalized === "super_admin";
};

const findCoupon = async (couponCode) => {
  const code = normalizeCouponCode(couponCode);
  if (!code) {
    return null;
  }

  const now = new Date();
  return Coupon.findOne({
    code,
    isActive: true,
    validFrom: { $lte: now },
    $or: [{ validUntil: null }, { validUntil: { $gte: now } }],
  }).lean();
};

const getAddressSnapshot = async ({ userId, addressId, addressPayload }) => {
  if (addressId) {
    ensureObjectId(addressId, "address id");
    const savedAddress = await Address.findById(addressId).lean();
    if (!savedAddress) {
      throw new ApiError("Address not found", 404);
    }
    if (String(savedAddress.user) !== String(userId)) {
      throw new ApiError("Not authorized to use this address", 403);
    }

    return {
      fullName: savedAddress.fullName,
      phone: savedAddress.phone,
      line1: savedAddress.line1,
      line2: savedAddress.line2,
      landmark: savedAddress.landmark,
      city: savedAddress.city,
      state: savedAddress.state,
      postalCode: savedAddress.postalCode,
      country: savedAddress.country,
    };
  }

  if (addressPayload && typeof addressPayload === "object") {
    return {
      fullName: String(addressPayload.fullName || "").trim(),
      phone: String(addressPayload.phone || "").trim(),
      line1: String(addressPayload.line1 || "").trim(),
      line2: String(addressPayload.line2 || "").trim(),
      landmark: String(addressPayload.landmark || "").trim(),
      city: String(addressPayload.city || "").trim(),
      state: String(addressPayload.state || "").trim(),
      postalCode: String(addressPayload.postalCode || "").trim(),
      country: String(addressPayload.country || "India").trim(),
    };
  }

  const defaultAddress = await Address.findOne({ user: userId, isDefault: true }).lean();
  if (defaultAddress) {
    return {
      fullName: defaultAddress.fullName,
      phone: defaultAddress.phone,
      line1: defaultAddress.line1,
      line2: defaultAddress.line2,
      landmark: defaultAddress.landmark,
      city: defaultAddress.city,
      state: defaultAddress.state,
      postalCode: defaultAddress.postalCode,
      country: defaultAddress.country,
    };
  }

  throw new ApiError("Shipping address is required", 400);
};

const sanitizeDeliverySlot = (value) => {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().slice(0, 100);
};

const getOrCreateCart = async (userId) => {
  const existing = await Cart.findOne({ user: userId });
  if (existing) {
    return existing;
  }

  return Cart.create({
    user: userId,
    items: [],
  });
};

const toCartResponse = ({ cart, productMap }) => {
  const responseItems = cart.items
    .map((item) => {
      const product = productMap.get(String(item.product));
      if (!product) {
        return null;
      }

      return {
        productId: product._id,
        quantity: item.quantity,
        lineTotal: Number((item.quantity * product.price).toFixed(2)),
        product: {
          _id: product._id,
          name: product.name,
          imageUrl: product.imageUrl || product.images?.[0]?.url || "",
          price: product.price,
          category: product.category,
          stock: product.stock,
          isActive: product.isActive,
        },
      };
    })
    .filter(Boolean);

  return {
    _id: cart._id,
    user: cart.user,
    items: responseItems,
    couponCode: cart.couponCode || "",
    subtotalAmount: cart.subtotalAmount || 0,
    discountAmount: cart.discountAmount || 0,
    shippingFee: cart.shippingFee || 0,
    totalAmount: cart.totalAmount || 0,
    updatedAt: cart.updatedAt,
  };
};

const resolveItemsFromPayload = async ({ userId, requestedItems }) => {
  if (Array.isArray(requestedItems) && requestedItems.length > 0) {
    return requestedItems.map((item) => {
      if (!item.productId || !item.quantity) {
        throw new ApiError("Each order item must include productId and quantity", 400);
      }

      ensureObjectId(item.productId, "product id");
      const quantity = Number(item.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        throw new ApiError("Item quantity must be a positive number", 400);
      }

      return {
        productId: String(item.productId),
        quantity: Math.floor(quantity),
      };
    });
  }

  const cart = await Cart.findOne({ user: userId }).lean();
  if (!cart || !Array.isArray(cart.items) || cart.items.length === 0) {
    throw new ApiError("Cart is empty", 400);
  }

  return cart.items.map((item) => ({
    productId: String(item.product),
    quantity: Math.floor(item.quantity),
  }));
};

const buildOrderItemsAndTotals = async ({ requestedItems, couponCode }) => {
  const productIds = requestedItems.map((item) => item.productId);
  const products = await Product.find({
    _id: { $in: productIds },
    isActive: true,
  }).lean();

  if (products.length !== productIds.length) {
    throw new ApiError("One or more products are invalid or inactive", 400);
  }

  const productMap = new Map(products.map((product) => [String(product._id), product]));
  const normalizedItems = requestedItems.map((item) => {
    const product = productMap.get(item.productId);
    if (!product) {
      throw new ApiError("Invalid product in order", 400);
    }

    if (product.stock < item.quantity) {
      throw new ApiError(`Insufficient stock for ${product.name}`, 400);
    }

    return {
      product: product._id,
      name: product.name,
      imageUrl: product.imageUrl || product.images?.[0]?.url || "",
      quantity: item.quantity,
      price: Number(product.price),
      category: product.category,
    };
  });

  const subtotal = normalizedItems.reduce((total, item) => total + item.price * item.quantity, 0);
  let discountAmount = 0;
  let appliedCouponCode = normalizeCouponCode(couponCode);
  if (appliedCouponCode) {
    const coupon = await findCoupon(appliedCouponCode);
    if (!coupon) {
      throw new ApiError("Invalid or expired coupon", 400);
    }
    discountAmount = calculateCouponDiscount({
      subtotal,
      coupon,
    });
    if (discountAmount <= 0) {
      throw new ApiError("Coupon is not applicable for this order", 400);
    }
  }

  const totals = calculateTotals({ subtotal, discountAmount });

  return {
    normalizedItems,
    totals,
    appliedCouponCode,
  };
};

const toOrderResponse = (order) => {
  const createdAt = order.createdAt ? new Date(order.createdAt) : new Date();
  const estimatedDeliveryDate = new Date(createdAt.getTime() + 4 * 24 * 60 * 60 * 1000);

  return {
    ...order,
    statusLabel: toStatusLabel(order.status),
    estimatedDeliveryDate,
    deliveryStatus:
      order.status === ORDER_STATUSES.DELIVERED
        ? "delivered"
        : order.status === ORDER_STATUSES.CANCELLED
          ? "cancelled"
          : "in_transit",
  };
};

const assertOrderAccess = (order, user) => {
  const isAdmin = user.role === "admin" || user.role === "super_admin";
  const isSameUser = String(order.user?._id || order.user) === String(user._id);
  if (!isAdmin && !isSameUser) {
    throw new ApiError("You are not allowed to view this order", 403);
  }
};

const reserveStock = async (items) =>
  Promise.all(
    items.map((item) =>
      Product.updateOne(
        {
          _id: item.product,
          stock: { $gte: item.quantity },
        },
        { $inc: { stock: -item.quantity } },
      ).then((result) => {
        if (result.modifiedCount === 0) {
          throw new ApiError(`Unable to reserve stock for ${item.name}`, 400);
        }
      }),
    ),
  );

const restoreStock = async (items) =>
  Promise.all(
    items.map((item) =>
      Product.updateOne({ _id: item.product }, { $inc: { stock: Number(item.quantity) || 0 } }),
    ),
  );

export const createOrder = asyncHandler(async (req, res) => {
  const { items, paymentMethod, addressId, address, couponCode, payment, deliverySlot } = req.body;
  const requestedItems = await resolveItemsFromPayload({
    userId: req.user._id,
    requestedItems: items,
  });

  const [addressSnapshot, itemResult] = await Promise.all([
    getAddressSnapshot({
      userId: req.user._id,
      addressId,
      addressPayload: address,
    }),
    buildOrderItemsAndTotals({
      requestedItems,
      couponCode,
    }),
  ]);

  await reserveStock(itemResult.normalizedItems);

  try {
    const selectedPaymentMethod = paymentMethod === "upi" ? "upi" : "cash_on_delivery";
    const paymentStatus =
      selectedPaymentMethod === "upi"
        ? payment?.status === "success"
          ? "success"
          : payment?.status === "failed"
            ? "failed"
            : "pending"
        : "cod_pending";

    const order = await Order.create({
      user: req.user._id,
      items: itemResult.normalizedItems,
      subtotalAmount: itemResult.totals.subtotalAmount,
      discountAmount: itemResult.totals.discountAmount,
      shippingFee: itemResult.totals.shippingFee,
      totalAmount: itemResult.totals.totalAmount,
      couponCode: itemResult.appliedCouponCode,
      status: ORDER_STATUSES.PLACED,
      statusTimeline: [
        {
          status: ORDER_STATUSES.PLACED,
          note: "Order placed",
          updatedBy: req.user._id,
        },
      ],
      payment: {
        method: selectedPaymentMethod,
        status: paymentStatus,
        transactionId: String(payment?.transactionId || "").trim(),
        upiApp: String(payment?.upiApp || "").trim(),
        failureReason: String(payment?.failureReason || "").trim(),
        paidAt: paymentStatus === "success" ? new Date() : undefined,
      },
      paymentMethod: selectedPaymentMethod,
      deliverySlot: sanitizeDeliverySlot(deliverySlot),
      address: addressSnapshot,
    });

    await Cart.findOneAndUpdate(
      { user: req.user._id },
      {
        $set: {
          items: [],
          couponCode: "",
          subtotalAmount: 0,
          discountAmount: 0,
          shippingFee: 0,
          totalAmount: 0,
        },
      },
    );

    const populated = await Order.findById(order._id)
      .populate("user", "name email role phone")
      .populate("items.product", "name price imageUrl")
      .lean();

    await createOrderUpdateNotification({
      order,
      title: "Order Placed",
      message: `Your order #${order._id.toString().slice(-6)} has been placed successfully.`,
    });

    res.status(201).json({
      success: true,
      message: "Order placed successfully",
      data: toOrderResponse(populated),
    });
  } catch (error) {
    await restoreStock(itemResult.normalizedItems);
    throw error;
  }
});

export const getAllOrders = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const query = {};

  if (req.query.status) {
    query.status = req.query.status;
  }

  const [orders, total] = await Promise.all([
    Order.find(query)
      .populate("user", "name email role phone")
      .populate("items.product", "name price imageUrl")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Order.countDocuments(query),
  ]);

  res.status(200).json({
    success: true,
    data: orders.map(toOrderResponse),
    pagination: buildPaginationMeta({ page, limit, total }),
  });
});

export const getOrdersByUser = asyncHandler(async (req, res) => {
  const { id: userId } = req.params;
  ensureObjectId(userId, "user id");

  const isAdmin = isElevatedRole(req.user.role);
  const isSameUser = String(req.user._id) === String(userId);

  if (!isAdmin && !isSameUser) {
    throw new ApiError("You are not allowed to view this user's orders", 403);
  }

  const { page, limit, skip } = getPagination(req.query);
  const query = { user: userId };

  const [orders, total] = await Promise.all([
    Order.find(query)
      .populate("items.product", "name price imageUrl")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Order.countDocuments(query),
  ]);

  res.status(200).json({
    success: true,
    data: orders.map(toOrderResponse),
    pagination: buildPaginationMeta({ page, limit, total }),
  });
});

export const getMyOrders = asyncHandler(async (req, res) => {
  req.params.id = String(req.user._id);
  return getOrdersByUser(req, res);
});

export const getOrderById = asyncHandler(async (req, res) => {
  ensureObjectId(req.params.id, "order id");

  const order = await Order.findById(req.params.id)
    .populate("user", "name email role phone")
    .populate("items.product", "name price imageUrl")
    .lean();

  if (!order) {
    throw new ApiError("Order not found", 404);
  }

  assertOrderAccess(order, req.user);

  res.status(200).json({
    success: true,
    data: toOrderResponse(order),
  });
});

export const reorderOrder = asyncHandler(async (req, res) => {
  ensureObjectId(req.params.id, "order id");

  const order = await Order.findById(req.params.id).lean();
  if (!order) {
    throw new ApiError("Order not found", 404);
  }

  assertOrderAccess(order, req.user);

  const requestedByProduct = new Map();
  for (const item of order.items || []) {
    const productId = String(item.product?._id || item.product || "");
    const quantity = Math.floor(Number(item.quantity) || 0);
    if (!productId || quantity <= 0) {
      continue;
    }
    requestedByProduct.set(productId, (requestedByProduct.get(productId) || 0) + quantity);
  }

  if (requestedByProduct.size === 0) {
    throw new ApiError("This order does not contain valid items to reorder", 400);
  }

  const requestedProductIds = Array.from(requestedByProduct.keys());
  const reorderableProducts = await Product.find({
    _id: { $in: requestedProductIds },
    isActive: true,
  }).lean();
  const reorderableProductMap = new Map(reorderableProducts.map((product) => [String(product._id), product]));

  const cart = await getOrCreateCart(req.user._id);
  const mergedByProduct = new Map(
    (cart.items || []).map((item) => [String(item.product), Math.max(1, Math.floor(Number(item.quantity) || 1))]),
  );

  let addedUnits = 0;
  let addedItems = 0;
  let skippedItems = 0;

  for (const [productId, reorderQuantity] of requestedByProduct.entries()) {
    const product = reorderableProductMap.get(productId);
    const stock = Math.max(0, Math.floor(Number(product?.stock) || 0));
    if (!product || stock <= 0) {
      skippedItems += 1;
      continue;
    }

    const currentQuantity = mergedByProduct.get(productId) || 0;
    const nextQuantity = Math.min(99, Math.min(stock, currentQuantity + reorderQuantity));

    if (nextQuantity <= currentQuantity) {
      skippedItems += 1;
      continue;
    }

    mergedByProduct.set(productId, nextQuantity);
    addedUnits += nextQuantity - currentQuantity;
    if (currentQuantity === 0) {
      addedItems += 1;
    }
  }

  if (addedUnits <= 0) {
    throw new ApiError("No reorderable items are currently available in stock", 400);
  }

  const mergedProductIds = Array.from(mergedByProduct.keys());
  const mergedProducts = await Product.find({
    _id: { $in: mergedProductIds },
    isActive: true,
  }).lean();
  const mergedProductMap = new Map(mergedProducts.map((product) => [String(product._id), product]));

  const normalizedItems = [];
  for (const [productId, quantity] of mergedByProduct.entries()) {
    const product = mergedProductMap.get(productId);
    if (!product) {
      continue;
    }

    const stock = Math.max(0, Math.floor(Number(product.stock) || 0));
    if (stock <= 0) {
      continue;
    }

    normalizedItems.push({
      product: productId,
      quantity: Math.max(1, Math.min(99, Math.min(stock, quantity))),
    });
  }

  cart.items = normalizedItems;
  cart.couponCode = "";
  const subtotal = normalizedItems.reduce((total, item) => {
    const product = mergedProductMap.get(String(item.product));
    return total + (Number(product?.price) || 0) * item.quantity;
  }, 0);
  const totals = calculateTotals({ subtotal, discountAmount: 0 });
  cart.subtotalAmount = totals.subtotalAmount;
  cart.discountAmount = totals.discountAmount;
  cart.shippingFee = totals.shippingFee;
  cart.totalAmount = totals.totalAmount;
  await cart.save();

  res.status(200).json({
    success: true,
    message: "Items reordered and added to cart",
    data: {
      orderId: order._id,
      addedUnits,
      addedItems,
      skippedItems,
      cart: toCartResponse({ cart, productMap: mergedProductMap }),
    },
  });
});

export const cancelOrder = asyncHandler(async (req, res) => {
  ensureObjectId(req.params.id, "order id");

  const order = await Order.findById(req.params.id);
  if (!order) {
    throw new ApiError("Order not found", 404);
  }

  assertOrderAccess(order, req.user);

  if (![ORDER_STATUSES.PLACED, ORDER_STATUSES.CONFIRMED].includes(order.status)) {
    throw new ApiError("This order can no longer be cancelled", 400);
  }

  order.status = ORDER_STATUSES.CANCELLED;
  order.cancelReason = String(req.body.reason || "Cancelled by customer").trim();
  order.cancelledAt = new Date();
  order.statusTimeline.push({
    status: ORDER_STATUSES.CANCELLED,
    note: order.cancelReason,
    updatedBy: req.user._id,
  });

  if (order.payment?.status === "success") {
    order.payment.status = "refunded";
  }

  await order.save();
  await restoreStock(order.items);

  await createOrderUpdateNotification({
    order,
    title: "Order Cancelled",
    message: `Order #${order._id.toString().slice(-6)} has been cancelled.`,
  });

  const populated = await Order.findById(order._id)
    .populate("user", "name email role phone")
    .populate("items.product", "name price imageUrl")
    .lean();

  res.status(200).json({
    success: true,
    message: "Order cancelled",
    data: toOrderResponse(populated),
  });
});

export const requestReturn = asyncHandler(async (req, res) => {
  ensureObjectId(req.params.id, "order id");

  const order = await Order.findById(req.params.id)
    .populate("user", "name email role phone")
    .populate("items.product", "name price imageUrl");
  if (!order) {
    throw new ApiError("Order not found", 404);
  }

  assertOrderAccess(order, req.user);

  if (![ORDER_STATUSES.DELIVERED, ORDER_STATUSES.OUT_FOR_DELIVERY].includes(order.status)) {
    throw new ApiError("Return request is allowed only for delivered orders", 400);
  }

  if (order.returnRequest?.requested) {
    throw new ApiError("Return already requested for this order", 400);
  }

  const reason = String(req.body.reason || "").trim();
  if (!reason) {
    throw new ApiError("Return reason is required", 400);
  }

  order.returnRequest = {
    requested: true,
    reason,
    requestedAt: new Date(),
    status: "requested",
    refundStatus: "not_initiated",
    refundTransactionId: "",
    resolutionNote: "",
  };
  order.status = ORDER_STATUSES.RETURN_REQUESTED;
  order.statusTimeline.push({
    status: ORDER_STATUSES.RETURN_REQUESTED,
    note: reason,
    updatedBy: req.user._id,
  });

  await order.save();

  await createOrderUpdateNotification({
    order,
    title: "Return Requested",
    message: `Return request raised for order #${order._id.toString().slice(-6)}.`,
  });

  res.status(200).json({
    success: true,
    message: "Return request submitted",
    data: toOrderResponse(order.toObject()),
  });
});

export const updateOrderStatus = asyncHandler(async (req, res) => {
  ensureObjectId(req.params.id, "order id");
  const nextStatus = String(req.body.status || "").trim();
  const note = String(req.body.note || "").trim();

  if (!nextStatus) {
    throw new ApiError("status is required", 400);
  }

  const order = await Order.findById(req.params.id);
  if (!order) {
    throw new ApiError("Order not found", 404);
  }

  if (!canTransitionOrderStatus(order.status, nextStatus)) {
    throw new ApiError(`Cannot move order from ${order.status} to ${nextStatus}`, 400);
  }

  order.status = nextStatus;
  order.statusTimeline.push({
    status: nextStatus,
    note: note || `Status updated to ${toStatusLabel(nextStatus)}`,
    updatedBy: req.user._id,
  });

  if (nextStatus === ORDER_STATUSES.DELIVERED && order.payment.method === "cash_on_delivery") {
    order.payment.status = "cod_collected";
    order.payment.paidAt = new Date();
  }

  if (nextStatus === ORDER_STATUSES.RETURNED && order.payment.status === "success") {
    order.payment.status = "refunded";
    await restoreStock(order.items);
  }

  await order.save();

  await createOrderUpdateNotification({
    order,
    title: "Order Update",
    message: `Order #${order._id.toString().slice(-6)} is now ${toStatusLabel(order.status)}.`,
  });

  const populated = await Order.findById(order._id)
    .populate("user", "name email role phone")
    .populate("items.product", "name price imageUrl")
    .lean();

  res.status(200).json({
    success: true,
    message: "Order status updated",
    data: toOrderResponse(populated),
  });
});

export const updateOrderPaymentStatus = asyncHandler(async (req, res) => {
  ensureObjectId(req.params.id, "order id");

  const order = await Order.findById(req.params.id);
  if (!order) {
    throw new ApiError("Order not found", 404);
  }

  assertOrderAccess(order, req.user);

  const { status, transactionId, failureReason, upiApp } = req.body;
  const normalizedStatus = String(status || "").trim();

  if (!["success", "failed", "pending", "cod_collected"].includes(normalizedStatus)) {
    throw new ApiError("Invalid payment status", 400);
  }

  order.payment.status = normalizedStatus;
  if (typeof transactionId === "string") {
    order.payment.transactionId = transactionId.trim();
  }
  if (typeof failureReason === "string") {
    order.payment.failureReason = failureReason.trim();
  }
  if (typeof upiApp === "string") {
    order.payment.upiApp = upiApp.trim();
  }

  if (normalizedStatus === "success" || normalizedStatus === "cod_collected") {
    order.payment.paidAt = new Date();
    if (order.status === ORDER_STATUSES.PLACED) {
      order.status = ORDER_STATUSES.CONFIRMED;
      order.statusTimeline.push({
        status: ORDER_STATUSES.CONFIRMED,
        note: "Payment successful. Order confirmed.",
        updatedBy: req.user._id,
      });
    }
  }

  await order.save();

  await createOrderUpdateNotification({
    order,
    title: "Payment Update",
    message: `Payment for order #${order._id.toString().slice(-6)} is ${normalizedStatus}.`,
  });

  const populated = await Order.findById(order._id)
    .populate("user", "name email role phone")
    .populate("items.product", "name price imageUrl")
    .lean();

  res.status(200).json({
    success: true,
    message: "Payment status updated",
    data: toOrderResponse(populated),
  });
});
