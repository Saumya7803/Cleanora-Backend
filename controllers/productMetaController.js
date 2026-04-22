import asyncHandler from "../middleware/asyncHandler.js";
import { ApiError } from "../middleware/errorMiddleware.js";
import ProductMeta from "../models/ProductMeta.js";
import Product from "../models/Product.js";
import { ensureObjectId, toArrayOfStrings, toBoolean, toFiniteNumber, toSafeString } from "../utils/adminUtils.js";

const ALLOWED_PRODUCT_STATUSES = new Set(["active", "draft", "hidden"]);
const ALLOWED_TAGS = new Set(["Bestseller", "Trending"]);

const normalizeStatus = (value, fallback = "active") => {
  const candidate = toSafeString(value).toLowerCase();
  return ALLOWED_PRODUCT_STATUSES.has(candidate) ? candidate : fallback;
};

const normalizeProductVariants = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((variant, index) => {
      const id = toSafeString(variant?.id) || `variant-${index + 1}`;
      const size = toSafeString(variant?.size);
      if (!size) {
        return null;
      }

      return {
        id,
        size,
        price: Math.max(0, toFiniteNumber(variant?.price, 0)),
        stock: Math.max(0, Math.floor(toFiniteNumber(variant?.stock, 0))),
      };
    })
    .filter(Boolean);
};

const normalizeProductMetaPayload = (payload = {}) => {
  const imageUrls = toArrayOfStrings(payload.imageUrls).filter((url) => /^https?:\/\//i.test(url));
  const tags = toArrayOfStrings(payload.tags).filter((tag) => ALLOWED_TAGS.has(tag));
  const productId = toSafeString(payload.productId);

  return {
    productId,
    sku: toSafeString(payload.sku),
    status: normalizeStatus(payload.status),
    mrp: Math.max(0, toFiniteNumber(payload.mrp, 0)),
    discountedPrice: Math.max(0, toFiniteNumber(payload.discountedPrice, 0)),
    tags,
    featured: toBoolean(payload.featured, false),
    variants: normalizeProductVariants(payload.variants),
    imageUrls,
    views: Math.max(0, Math.floor(toFiniteNumber(payload.views, 0))),
    analyticsOrders: Math.max(0, Math.floor(toFiniteNumber(payload.analyticsOrders, 0))),
    analyticsRevenue: Math.max(0, toFiniteNumber(payload.analyticsRevenue, 0)),
  };
};

const ensureProductExists = async (productId) => {
  ensureObjectId(productId, "product id");
  const productExists = await Product.exists({ _id: productId });
  if (!productExists) {
    throw new ApiError("Product not found for this productId", 404);
  }
};

export const listProductMeta = asyncHandler(async (_req, res) => {
  const rows = await ProductMeta.find({}).sort({ updatedAt: -1 }).lean();

  res.status(200).json({
    success: true,
    data: rows,
  });
});

export const createProductMeta = asyncHandler(async (req, res) => {
  const payload = normalizeProductMetaPayload(req.body);
  if (!payload.productId) {
    throw new ApiError("productId is required", 400);
  }

  await ensureProductExists(payload.productId);

  const row = await ProductMeta.findOneAndUpdate(
    { productId: payload.productId },
    {
      $set: {
        ...payload,
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
  );

  res.status(201).json({
    success: true,
    message: "Product meta saved",
    data: row,
  });
});

export const updateProductMeta = asyncHandler(async (req, res) => {
  ensureObjectId(req.params.id, "product meta id");

  const row = await ProductMeta.findById(req.params.id);
  if (!row) {
    throw new ApiError("Product meta not found", 404);
  }

  const payload = normalizeProductMetaPayload({
    ...row.toObject(),
    ...req.body,
    productId: Object.prototype.hasOwnProperty.call(req.body, "productId")
      ? req.body.productId
      : String(row.productId),
  });

  if (!payload.productId) {
    throw new ApiError("productId is required", 400);
  }

  await ensureProductExists(payload.productId);

  row.productId = payload.productId;
  row.sku = payload.sku;
  row.status = payload.status;
  row.mrp = payload.mrp;
  row.discountedPrice = payload.discountedPrice;
  row.tags = payload.tags;
  row.featured = payload.featured;
  row.variants = payload.variants;
  row.imageUrls = payload.imageUrls;
  row.views = payload.views;
  row.analyticsOrders = payload.analyticsOrders;
  row.analyticsRevenue = payload.analyticsRevenue;
  row.updatedBy = req.user._id;
  await row.save();

  res.status(200).json({
    success: true,
    message: "Product meta updated",
    data: row,
  });
});

export const deleteProductMeta = asyncHandler(async (req, res) => {
  ensureObjectId(req.params.id, "product meta id");

  const row = await ProductMeta.findByIdAndDelete(req.params.id);
  if (!row) {
    throw new ApiError("Product meta not found", 404);
  }

  res.status(200).json({
    success: true,
    message: "Product meta deleted",
    data: {
      _id: row._id,
      productId: row.productId,
    },
  });
});
