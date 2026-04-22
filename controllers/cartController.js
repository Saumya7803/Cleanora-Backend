import mongoose from "mongoose";

import Cart from "../models/Cart.js";
import Coupon from "../models/Coupon.js";
import Product from "../models/Product.js";
import asyncHandler from "../middleware/asyncHandler.js";
import { ApiError } from "../middleware/errorMiddleware.js";
import {
  calculateCouponDiscount,
  calculateTotals,
  normalizeCouponCode,
} from "../utils/pricing.js";

const ensureObjectId = (value, label) => {
  if (!mongoose.isValidObjectId(value)) {
    throw new ApiError(`Invalid ${label}`, 400);
  }
};

const findCoupon = async (couponCode) => {
  const code = normalizeCouponCode(couponCode);
  if (!code) {
    return null;
  }

  const now = new Date();
  const coupon = await Coupon.findOne({
    code,
    isActive: true,
    validFrom: { $lte: now },
    $or: [{ validUntil: null }, { validUntil: { $gte: now } }],
  }).lean();

  return coupon;
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

const recalculateCart = async (cart) => {
  const productIds = cart.items.map((item) => item.product);
  const products = await Product.find({
    _id: { $in: productIds },
    isActive: true,
  }).lean();
  const productMap = new Map(products.map((product) => [String(product._id), product]));

  const normalizedItems = [];
  for (const item of cart.items) {
    const product = productMap.get(String(item.product));
    if (!product || product.stock <= 0) {
      continue;
    }

    const quantity = Math.max(1, Math.min(Number(item.quantity) || 1, product.stock));
    normalizedItems.push({
      product: item.product,
      quantity,
    });
  }

  cart.items = normalizedItems;

  const subtotal = normalizedItems.reduce((total, item) => {
    const product = productMap.get(String(item.product));
    return total + (product?.price || 0) * item.quantity;
  }, 0);

  let discountAmount = 0;
  let couponCode = normalizeCouponCode(cart.couponCode);
  if (couponCode) {
    const coupon = await findCoupon(couponCode);
    if (coupon) {
      discountAmount = calculateCouponDiscount({ subtotal, coupon });
      if (discountAmount <= 0) {
        couponCode = "";
      }
    } else {
      couponCode = "";
    }
  }

  cart.couponCode = couponCode;
  const totals = calculateTotals({ subtotal, discountAmount });
  cart.subtotalAmount = totals.subtotalAmount;
  cart.discountAmount = totals.discountAmount;
  cart.shippingFee = totals.shippingFee;
  cart.totalAmount = totals.totalAmount;
  await cart.save();

  return {
    cart,
    productMap,
  };
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

export const getMyCart = asyncHandler(async (req, res) => {
  const cart = await getOrCreateCart(req.user._id);
  const { cart: updatedCart, productMap } = await recalculateCart(cart);

  res.status(200).json({
    success: true,
    data: toCartResponse({ cart: updatedCart, productMap }),
  });
});

export const syncCart = asyncHandler(async (req, res) => {
  const incomingItems = Array.isArray(req.body.items) ? req.body.items : null;
  if (!incomingItems) {
    throw new ApiError("items array is required", 400);
  }

  const cart = await getOrCreateCart(req.user._id);
  const merged = new Map();

  for (const entry of incomingItems) {
    ensureObjectId(entry.productId, "product id");
    const quantity = Number(entry.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      continue;
    }
    merged.set(entry.productId, Math.min(99, Math.floor(quantity)));
  }

  cart.items = Array.from(merged.entries()).map(([productId, quantity]) => ({
    product: productId,
    quantity,
  }));

  const { cart: updatedCart, productMap } = await recalculateCart(cart);

  res.status(200).json({
    success: true,
    message: "Cart synced",
    data: toCartResponse({ cart: updatedCart, productMap }),
  });
});

export const addCartItem = asyncHandler(async (req, res) => {
  const { productId, quantity = 1 } = req.body;
  ensureObjectId(productId, "product id");

  const quantityValue = Number(quantity);
  if (!Number.isFinite(quantityValue) || quantityValue <= 0) {
    throw new ApiError("quantity must be a positive number", 400);
  }

  const product = await Product.findOne({ _id: productId, isActive: true }).lean();
  if (!product) {
    throw new ApiError("Product not found", 404);
  }
  if (product.stock <= 0) {
    throw new ApiError("Product is out of stock", 400);
  }

  const cart = await getOrCreateCart(req.user._id);
  const existing = cart.items.find((item) => String(item.product) === productId);
  if (existing) {
    existing.quantity = Math.min(product.stock, existing.quantity + Math.floor(quantityValue));
  } else {
    cart.items.push({
      product: productId,
      quantity: Math.min(product.stock, Math.floor(quantityValue)),
    });
  }

  const { cart: updatedCart, productMap } = await recalculateCart(cart);
  res.status(200).json({
    success: true,
    message: "Item added to cart",
    data: toCartResponse({ cart: updatedCart, productMap }),
  });
});

export const updateCartItem = asyncHandler(async (req, res) => {
  const { productId } = req.params;
  const { quantity } = req.body;
  ensureObjectId(productId, "product id");

  const quantityValue = Number(quantity);
  if (!Number.isFinite(quantityValue)) {
    throw new ApiError("quantity is required", 400);
  }

  const cart = await getOrCreateCart(req.user._id);
  const existing = cart.items.find((item) => String(item.product) === productId);
  if (!existing) {
    throw new ApiError("Item not found in cart", 404);
  }

  if (quantityValue <= 0) {
    cart.items = cart.items.filter((item) => String(item.product) !== productId);
  } else {
    existing.quantity = Math.min(99, Math.floor(quantityValue));
  }

  const { cart: updatedCart, productMap } = await recalculateCart(cart);
  res.status(200).json({
    success: true,
    message: "Cart item updated",
    data: toCartResponse({ cart: updatedCart, productMap }),
  });
});

export const removeCartItem = asyncHandler(async (req, res) => {
  const { productId } = req.params;
  ensureObjectId(productId, "product id");

  const cart = await getOrCreateCart(req.user._id);
  cart.items = cart.items.filter((item) => String(item.product) !== productId);

  const { cart: updatedCart, productMap } = await recalculateCart(cart);
  res.status(200).json({
    success: true,
    message: "Item removed from cart",
    data: toCartResponse({ cart: updatedCart, productMap }),
  });
});

export const applyCouponToCart = asyncHandler(async (req, res) => {
  const couponCode = normalizeCouponCode(req.body.code);
  if (!couponCode) {
    throw new ApiError("Coupon code is required", 400);
  }

  const coupon = await findCoupon(couponCode);
  if (!coupon) {
    throw new ApiError("Invalid or expired coupon", 400);
  }

  const cart = await getOrCreateCart(req.user._id);
  cart.couponCode = couponCode;
  const { cart: updatedCart, productMap } = await recalculateCart(cart);

  if (updatedCart.couponCode !== couponCode) {
    throw new ApiError("Coupon is not applicable for the current cart total", 400);
  }

  res.status(200).json({
    success: true,
    message: "Coupon applied",
    data: toCartResponse({ cart: updatedCart, productMap }),
  });
});

export const removeCouponFromCart = asyncHandler(async (req, res) => {
  const cart = await getOrCreateCart(req.user._id);
  cart.couponCode = "";
  const { cart: updatedCart, productMap } = await recalculateCart(cart);

  res.status(200).json({
    success: true,
    message: "Coupon removed",
    data: toCartResponse({ cart: updatedCart, productMap }),
  });
});

export const clearCart = asyncHandler(async (req, res) => {
  const cart = await getOrCreateCart(req.user._id);
  cart.items = [];
  cart.couponCode = "";
  const { cart: updatedCart, productMap } = await recalculateCart(cart);

  res.status(200).json({
    success: true,
    message: "Cart cleared",
    data: toCartResponse({ cart: updatedCart, productMap }),
  });
});
