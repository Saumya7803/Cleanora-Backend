import mongoose from "mongoose";

import Cart from "../models/Cart.js";
import Product from "../models/Product.js";
import Wishlist from "../models/Wishlist.js";
import asyncHandler from "../middleware/asyncHandler.js";
import { ApiError } from "../middleware/errorMiddleware.js";

const formatInr = (amount) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(amount || 0));

const ensureObjectId = (value, label) => {
  if (!mongoose.isValidObjectId(value)) {
    throw new ApiError(`Invalid ${label}`, 400);
  }
};

const getOrCreateWishlist = async (userId) => {
  const existing = await Wishlist.findOne({ user: userId });
  if (existing) {
    return existing;
  }

  return Wishlist.create({
    user: userId,
    items: [],
  });
};

const toWishlistResponse = async (wishlist) => {
  const productIds = wishlist.items.map((item) => item.product);
  const products = await Product.find({ _id: { $in: productIds }, isActive: true }).lean();
  const productMap = new Map(products.map((product) => [String(product._id), product]));

  return {
    _id: wishlist._id,
    user: wishlist.user,
    items: wishlist.items
      .map((item) => {
        const product = productMap.get(String(item.product));
        if (!product) {
          return null;
        }
        return {
          productId: product._id,
          addedAt: item.addedAt,
          priceAtAdded: item.priceAtAdded || 0,
          priceDropped: Number(item.priceAtAdded || 0) > Number(product.price || 0),
          priceDropAmount: Math.max(0, Number(item.priceAtAdded || 0) - Number(product.price || 0)),
          isOutOfStock: Number(product.stock || 0) <= 0,
          product: {
            _id: product._id,
            name: product.name,
            imageUrl: product.imageUrl || product.images?.[0]?.url || "",
            price: product.price,
            category: product.category,
            stock: product.stock,
          },
        };
      })
      .filter(Boolean),
  };
};

export const getWishlist = asyncHandler(async (req, res) => {
  const wishlist = await getOrCreateWishlist(req.user._id);
  res.status(200).json({
    success: true,
    data: await toWishlistResponse(wishlist),
  });
});

export const addToWishlist = asyncHandler(async (req, res) => {
  const { productId } = req.body;
  ensureObjectId(productId, "product id");

  const product = await Product.findOne({ _id: productId, isActive: true }).lean();
  if (!product) {
    throw new ApiError("Product not found", 404);
  }

  const wishlist = await getOrCreateWishlist(req.user._id);
  const exists = wishlist.items.some((item) => String(item.product) === productId);

  if (!exists) {
    wishlist.items.unshift({
      product: productId,
      addedAt: new Date(),
      priceAtAdded: Number(product.price || 0),
      lastKnownPrice: Number(product.price || 0),
      wasOutOfStock: Number(product.stock || 0) <= 0,
    });
    await wishlist.save();
  }

  res.status(200).json({
    success: true,
    message: "Added to wishlist",
    data: await toWishlistResponse(wishlist),
  });
});

export const removeFromWishlist = asyncHandler(async (req, res) => {
  const { productId } = req.params;
  ensureObjectId(productId, "product id");

  const wishlist = await getOrCreateWishlist(req.user._id);
  wishlist.items = wishlist.items.filter((item) => String(item.product) !== productId);
  await wishlist.save();

  res.status(200).json({
    success: true,
    message: "Removed from wishlist",
    data: await toWishlistResponse(wishlist),
  });
});

export const moveWishlistItemToCart = asyncHandler(async (req, res) => {
  const { productId } = req.params;
  ensureObjectId(productId, "product id");

  const product = await Product.findOne({ _id: productId, isActive: true }).lean();
  if (!product) {
    throw new ApiError("Product not found", 404);
  }

  if (product.stock <= 0) {
    throw new ApiError("Product is out of stock", 400);
  }

  const [wishlist, cart] = await Promise.all([
    getOrCreateWishlist(req.user._id),
    Cart.findOneAndUpdate(
      { user: req.user._id },
      { $setOnInsert: { user: req.user._id, items: [] } },
      { upsert: true, new: true },
    ),
  ]);

  const existingCartItem = cart.items.find((item) => String(item.product) === productId);
  if (existingCartItem) {
    existingCartItem.quantity = Math.min(existingCartItem.quantity + 1, product.stock);
  } else {
    cart.items.push({ product: productId, quantity: 1 });
  }

  wishlist.items = wishlist.items.filter((item) => String(item.product) !== productId);

  await Promise.all([wishlist.save(), cart.save()]);

  res.status(200).json({
    success: true,
    message: "Moved to cart",
    data: {
      wishlist: await toWishlistResponse(wishlist),
      cart: {
        _id: cart._id,
        itemsCount: cart.items.length,
      },
    },
  });
});

export const shareWishlist = asyncHandler(async (req, res) => {
  const wishlist = await getOrCreateWishlist(req.user._id);
  const response = await toWishlistResponse(wishlist);

  const lines = response.items
    .slice(0, 10)
    .map((item, index) => `${index + 1}. ${item.product.name} - ${formatInr(item.product.price)}`);
  const shareText =
    lines.length === 0
      ? "My StoreSync wishlist is currently empty."
      : `My StoreSync Wishlist:\n${lines.join("\n")}`;

  res.status(200).json({
    success: true,
    data: {
      itemsCount: response.items.length,
      shareText,
      items: response.items,
    },
  });
});
