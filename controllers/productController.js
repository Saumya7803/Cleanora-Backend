import mongoose from "mongoose";

import Order from "../models/Order.js";
import Product from "../models/Product.js";
import Review from "../models/Review.js";
import asyncHandler from "../middleware/asyncHandler.js";
import { ApiError } from "../middleware/errorMiddleware.js";
import { deleteCloudinaryAsset, uploadImageBuffer } from "../config/cloudinary.js";
import { notifyWishlistAlertsForProduct } from "../services/wishlistAlertService.js";
import { buildPaginationMeta, getPagination } from "../utils/pagination.js";

const validateObjectId = (value, label) => {
  if (!mongoose.isValidObjectId(value)) {
    throw new ApiError(`Invalid ${label}`, 400);
  }
};

const toNormalizedProduct = (product) => {
  const images = Array.isArray(product.images)
    ? product.images.filter((image) => image?.url)
    : product.imageUrl
      ? [{ url: product.imageUrl, publicId: product.cloudinaryPublicId || "" }]
      : [];

  return {
    ...product,
    imageUrl: product.imageUrl || images[0]?.url || "",
    images,
    isActive:
      typeof product.isActive === "boolean"
        ? product.isActive
        : typeof product.is_active === "boolean"
          ? product.is_active
          : true,
    ratingAverage: Number(product.ratingAverage || 0),
    ratingCount: Number(product.ratingCount || 0),
  };
};

const parseNumberQuery = (value) => {
  if (typeof value === "undefined" || value === null || value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const buildProductQuery = (query) => {
  const filter = {};

  if (typeof query.isActive !== "undefined") {
    filter.isActive = query.isActive === "true";
  } else {
    filter.isActive = true;
  }

  if (query.category) {
    filter.category = { $regex: `^${query.category}$`, $options: "i" };
  }

  if (query.search) {
    const searchRegex = { $regex: query.search, $options: "i" };
    filter.$or = [{ name: searchRegex }, { description: searchRegex }, { category: searchRegex }];
  }

  const minPrice = parseNumberQuery(query.minPrice);
  const maxPrice = parseNumberQuery(query.maxPrice);
  if (minPrice !== null || maxPrice !== null) {
    filter.price = {};
    if (minPrice !== null) {
      filter.price.$gte = minPrice;
    }
    if (maxPrice !== null) {
      filter.price.$lte = maxPrice;
    }
  }

  if (query.availability === "in_stock" || query.availability === "available") {
    filter.stock = { $gt: 0 };
  }
  if (query.availability === "out_of_stock" || query.availability === "unavailable") {
    filter.stock = { $lte: 0 };
  }

  return filter;
};

const sortOptions = {
  newest: { createdAt: -1 },
  price_asc: { price: 1 },
  price_desc: { price: -1 },
  rating_desc: { ratingAverage: -1, ratingCount: -1 },
  trending: { ratingCount: -1, ratingAverage: -1, createdAt: -1 },
};

export const getProducts = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const query = buildProductQuery(req.query);
  const sort = sortOptions[req.query.sort] || sortOptions.newest;

  const [products, total] = await Promise.all([
    Product.find(query).sort(sort).skip(skip).limit(limit).lean(),
    Product.countDocuments(query),
  ]);

  res.status(200).json({
    success: true,
    data: products.map(toNormalizedProduct),
    pagination: buildPaginationMeta({ page, limit, total }),
  });
});

export const getProductCategories = asyncHandler(async (_req, res) => {
  const categories = await Product.distinct("category", { isActive: true });

  res.status(200).json({
    success: true,
    data: categories.filter(Boolean).sort((a, b) => a.localeCompare(b)),
  });
});

export const getProductById = asyncHandler(async (req, res) => {
  validateObjectId(req.params.id, "product id");

  const product = await Product.findById(req.params.id).lean();
  if (!product || !product.isActive) {
    throw new ApiError("Product not found", 404);
  }

  const reviews = await Review.find({ product: product._id })
    .populate("user", "name")
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  res.status(200).json({
    success: true,
    data: {
      ...toNormalizedProduct(product),
      reviews: reviews.map((review) => ({
        _id: review._id,
        user: {
          _id: review.user?._id,
          name: review.user?.name || "Customer",
        },
        rating: review.rating,
        title: review.title,
        comment: review.comment,
        isVerifiedPurchase: review.isVerifiedPurchase,
        createdAt: review.createdAt,
      })),
    },
  });
});

export const getRecommendationFeed = asyncHandler(async (req, res) => {
  const limit = Math.min(20, Math.max(4, Number(req.query.limit || 8)));
  const userId = typeof req.query.userId === "string" ? req.query.userId.trim() : "";

  const [trendingProducts, fallbackProducts] = await Promise.all([
    Product.find({ isActive: true, stock: { $gt: 0 } })
      .sort(sortOptions.trending)
      .limit(limit)
      .lean(),
    Product.find({ isActive: true, stock: { $gt: 0 } })
      .sort({ createdAt: -1 })
      .limit(limit * 3)
      .lean(),
  ]);

  let preferredCategories = [];
  if (userId && mongoose.isValidObjectId(userId)) {
    const orders = await Order.find({
      user: userId,
      status: { $in: ["confirmed", "shipped", "out_for_delivery", "delivered"] },
    })
      .sort({ createdAt: -1 })
      .limit(30)
      .lean();

    const categoryScore = new Map();
    for (const order of orders) {
      for (const item of order.items || []) {
        const category = String(item.category || "").trim();
        if (!category) {
          continue;
        }
        categoryScore.set(category, (categoryScore.get(category) || 0) + Number(item.quantity || 1));
      }
    }
    preferredCategories = [...categoryScore.entries()]
      .sort((left, right) => right[1] - left[1])
      .map(([category]) => category)
      .slice(0, 3);
  }

  const similarProducts = preferredCategories.length
    ? fallbackProducts
        .filter((product) => preferredCategories.includes(product.category))
        .slice(0, limit)
    : trendingProducts.slice(0, limit);

  const youMayAlsoLike = fallbackProducts
    .filter(
      (product) =>
        !similarProducts.some((item) => String(item._id) === String(product._id)) &&
        !trendingProducts.some((item) => String(item._id) === String(product._id)),
    )
    .slice(0, limit);

  res.status(200).json({
    success: true,
    data: {
      similarProducts: similarProducts.map(toNormalizedProduct),
      trendingProducts: trendingProducts.map(toNormalizedProduct),
      youMayAlsoLike: youMayAlsoLike.map(toNormalizedProduct),
      preferredCategories,
    },
  });
});

export const getTrendingSearchTerms = asyncHandler(async (_req, res) => {
  const topProducts = await Product.find({ isActive: true })
    .sort({ ratingCount: -1, ratingAverage: -1, createdAt: -1 })
    .limit(30)
    .lean();

  const termScores = new Map();
  for (const product of topProducts) {
    const score = Math.max(1, Number(product.ratingCount || 0));
    termScores.set(product.name, (termScores.get(product.name) || 0) + score);
    termScores.set(product.category, (termScores.get(product.category) || 0) + score * 0.5);
  }

  const trendingTerms = [...termScores.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([term]) => term)
    .filter(Boolean)
    .slice(0, 12);

  res.status(200).json({
    success: true,
    data: trendingTerms,
  });
});

const normalizeIncomingImages = (body) => {
  if (Array.isArray(body.images)) {
    return body.images
      .filter((image) => image && typeof image.url === "string" && image.url.trim())
      .map((image) => ({
        url: image.url.trim(),
        publicId: typeof image.publicId === "string" ? image.publicId.trim() : "",
      }));
  }

  if (typeof body.imageUrl === "string" && body.imageUrl.trim()) {
    return [
      {
        url: body.imageUrl.trim(),
        publicId: typeof body.cloudinaryPublicId === "string" ? body.cloudinaryPublicId.trim() : "",
      },
    ];
  }

  return [];
};

export const createProduct = asyncHandler(async (req, res) => {
  const { name, description, price, category, stock, isActive } = req.body;

  if (!name || !description || typeof price === "undefined" || !category) {
    throw new ApiError("name, description, price, and category are required", 400);
  }

  const images = normalizeIncomingImages(req.body);

  const product = await Product.create({
    name: String(name).trim(),
    description: String(description).trim(),
    price: Number(price),
    category: String(category).trim(),
    stock: Number(stock || 0),
    images,
    imageUrl: images[0]?.url || "",
    cloudinaryPublicId: images[0]?.publicId || "",
    isActive: typeof isActive === "boolean" ? isActive : true,
    createdBy: req.user._id,
  });

  res.status(201).json({
    success: true,
    message: "Product created successfully",
    data: toNormalizedProduct(product.toObject()),
  });
});

export const updateProduct = asyncHandler(async (req, res) => {
  validateObjectId(req.params.id, "product id");

  const product = await Product.findById(req.params.id);
  if (!product) {
    throw new ApiError("Product not found", 404);
  }

  const fields = ["name", "description", "price", "category", "stock", "isActive"];
  fields.forEach((field) => {
    if (typeof req.body[field] !== "undefined") {
      product[field] = req.body[field];
    }
  });

  if (typeof req.body.imageUrl !== "undefined" || Array.isArray(req.body.images)) {
    const normalizedImages = normalizeIncomingImages(req.body);
    product.images = normalizedImages;
    product.imageUrl = normalizedImages[0]?.url || "";
    product.cloudinaryPublicId = normalizedImages[0]?.publicId || "";
  }

  await product.save();
  await notifyWishlistAlertsForProduct(product.toObject());

  res.status(200).json({
    success: true,
    message: "Product updated successfully",
    data: toNormalizedProduct(product.toObject()),
  });
});

export const deleteProduct = asyncHandler(async (req, res) => {
  validateObjectId(req.params.id, "product id");

  const product = await Product.findById(req.params.id);
  if (!product) {
    throw new ApiError("Product not found", 404);
  }

  if (Array.isArray(product.images) && product.images.length > 0) {
    await Promise.all(product.images.map((image) => deleteCloudinaryAsset(image.publicId)));
  } else {
    await deleteCloudinaryAsset(product.cloudinaryPublicId);
  }

  await product.deleteOne();
  await Review.deleteMany({ product: product._id });

  res.status(200).json({
    success: true,
    message: "Product deleted successfully",
  });
});

export const uploadProductImage = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new ApiError("Image file is required", 400);
  }

  const uploadResult = await uploadImageBuffer(req.file.buffer, "storesync/products", req.file.mimetype);

  res.status(200).json({
    success: true,
    message: "Image uploaded successfully",
    data: {
      imageUrl: uploadResult.imageUrl,
      publicId: uploadResult.publicId,
      image: {
        url: uploadResult.imageUrl,
        publicId: uploadResult.publicId,
      },
    },
  });
});
