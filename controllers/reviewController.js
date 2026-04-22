import mongoose from "mongoose";

import Order from "../models/Order.js";
import Product from "../models/Product.js";
import Review from "../models/Review.js";
import { uploadImageBuffer } from "../config/cloudinary.js";
import asyncHandler from "../middleware/asyncHandler.js";
import { ApiError } from "../middleware/errorMiddleware.js";

const ensureObjectId = (value, label) => {
  if (!mongoose.isValidObjectId(value)) {
    throw new ApiError(`Invalid ${label}`, 400);
  }
};

const recalculateProductRating = async (productId) => {
  const [summary] = await Review.aggregate([
    { $match: { product: new mongoose.Types.ObjectId(productId) } },
    {
      $group: {
        _id: "$product",
        count: { $sum: 1 },
        average: { $avg: "$rating" },
      },
    },
  ]);

  await Product.findByIdAndUpdate(productId, {
    ratingCount: summary?.count || 0,
    ratingAverage: summary?.average ? Number(summary.average.toFixed(2)) : 0,
  });
};

export const getProductReviews = asyncHandler(async (req, res) => {
  ensureObjectId(req.params.id, "product id");

  const sortBy = String(req.query.sort || "latest").toLowerCase();
  let sort = { createdAt: -1 };
  if (sortBy === "highest" || sortBy === "highest_rating") {
    sort = { rating: -1, createdAt: -1 };
  } else if (sortBy === "lowest" || sortBy === "lowest_rating") {
    sort = { rating: 1, createdAt: -1 };
  }

  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 50)));
  const reviews = await Review.find({ product: req.params.id })
    .populate("user", "name")
    .sort(sort)
    .limit(limit)
    .lean();

  res.status(200).json({
    success: true,
    data: reviews.map((review) => ({
      _id: review._id,
      user: {
        _id: review.user?._id,
        name: review.user?.name || "Customer",
      },
      rating: review.rating,
      title: review.title,
      comment: review.comment,
      isVerifiedPurchase: review.isVerifiedPurchase,
      images: Array.isArray(review.images)
        ? review.images
            .filter((item) => item?.url)
            .map((item) => ({ url: item.url, publicId: item.publicId || "" }))
        : [],
      helpfulCount: Number(review.helpfulCount || 0),
      isHelpfulByMe: req.user
          ? (review.helpfulBy || []).some(
              (entry) => String(entry) === String(req.user._id),
            )
          : false,
      createdAt: review.createdAt,
    })),
  });
});

export const upsertProductReview = asyncHandler(async (req, res) => {
  ensureObjectId(req.params.id, "product id");
  const { rating, title, comment } = req.body;

  const numericRating = Number(rating);
  if (!Number.isFinite(numericRating) || numericRating < 1 || numericRating > 5) {
    throw new ApiError("rating must be between 1 and 5", 400);
  }

  const product = await Product.findById(req.params.id).lean();
  if (!product || !product.isActive) {
    throw new ApiError("Product not found", 404);
  }

  const hasPurchasedProduct = await Order.exists({
    user: req.user._id,
    status: { $in: ["confirmed", "shipped", "out_for_delivery", "delivered"] },
    "items.product": req.params.id,
  });

  const reviewImages = Array.isArray(req.body.images)
    ? req.body.images
        .filter((item) => item && typeof item.url === "string" && item.url.trim())
        .slice(0, 5)
        .map((item) => ({
          url: item.url.trim(),
          publicId: typeof item.publicId === "string" ? item.publicId.trim() : "",
        }))
    : [];

  const review = await Review.findOneAndUpdate(
    {
      product: req.params.id,
      user: req.user._id,
    },
    {
      rating: numericRating,
      title: typeof title === "string" ? title.trim() : "",
      comment: typeof comment === "string" ? comment.trim() : "",
      isVerifiedPurchase: Boolean(hasPurchasedProduct),
      images: reviewImages,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  )
    .populate("user", "name")
    .lean();

  await recalculateProductRating(req.params.id);

  res.status(200).json({
    success: true,
    message: "Review saved successfully",
    data: {
      _id: review._id,
      user: {
        _id: review.user?._id,
        name: review.user?.name || "Customer",
      },
      rating: review.rating,
      title: review.title,
      comment: review.comment,
      isVerifiedPurchase: review.isVerifiedPurchase,
      images: Array.isArray(review.images)
        ? review.images
            .filter((item) => item?.url)
            .map((item) => ({ url: item.url, publicId: item.publicId || "" }))
        : [],
      helpfulCount: Number(review.helpfulCount || 0),
      isHelpfulByMe: false,
      createdAt: review.createdAt,
    },
  });
});

export const toggleReviewHelpful = asyncHandler(async (req, res) => {
  ensureObjectId(req.params.id, "product id");
  ensureObjectId(req.params.reviewId, "review id");

  const review = await Review.findOne({
    _id: req.params.reviewId,
    product: req.params.id,
  });
  if (!review) {
    throw new ApiError("Review not found", 404);
  }

  const myId = String(req.user._id);
  const alreadyHelpful = review.helpfulBy.some((entry) => String(entry) === myId);

  if (alreadyHelpful) {
    review.helpfulBy = review.helpfulBy.filter((entry) => String(entry) !== myId);
  } else {
    review.helpfulBy.push(req.user._id);
  }
  review.helpfulCount = review.helpfulBy.length;
  await review.save();

  res.status(200).json({
    success: true,
    data: {
      reviewId: review._id,
      helpfulCount: review.helpfulCount,
      isHelpfulByMe: !alreadyHelpful,
    },
  });
});

export const uploadReviewImage = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new ApiError("Image file is required", 400);
  }

  const uploadResult = await uploadImageBuffer(
    req.file.buffer,
    "storesync/reviews",
    req.file.mimetype,
  );

  res.status(200).json({
    success: true,
    message: "Review image uploaded",
    data: {
      url: uploadResult.imageUrl,
      publicId: uploadResult.publicId,
    },
  });
});
