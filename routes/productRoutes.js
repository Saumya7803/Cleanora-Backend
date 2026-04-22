import express from "express";

import {
  createProduct,
  deleteProduct,
  getRecommendationFeed,
  getProductById,
  getProductCategories,
  getProducts,
  getTrendingSearchTerms,
  updateProduct,
  uploadProductImage,
} from "../controllers/productController.js";
import {
  getProductReviews,
  toggleReviewHelpful,
  upsertProductReview,
  uploadReviewImage,
} from "../controllers/reviewController.js";
import { adminOnly, protect } from "../middleware/authMiddleware.js";
import { createResponseCache } from "../middleware/responseCache.js";
import upload from "../middleware/uploadMiddleware.js";

const router = express.Router();
const publicListCache = createResponseCache({ ttlSeconds: 12, maxEntries: 600 });
const publicDetailCache = createResponseCache({ ttlSeconds: 20, maxEntries: 800 });

router.get("/", publicListCache, getProducts);
router.get("/recommendations/feed", publicListCache, getRecommendationFeed);
router.get("/search/trending", publicListCache, getTrendingSearchTerms);
router.get("/categories/list", publicListCache, getProductCategories);
router.post("/reviews/upload-image", protect, upload.single("image"), uploadReviewImage);
router.get("/:id", publicDetailCache, getProductById);
router.get("/:id/reviews", publicDetailCache, getProductReviews);
router.post("/:id/reviews", protect, upsertProductReview);
router.post("/:id/reviews/:reviewId/helpful", protect, toggleReviewHelpful);
router.post("/", protect, adminOnly, createProduct);
router.post("/upload-image", protect, adminOnly, upload.single("image"), uploadProductImage);
router.put("/:id", protect, adminOnly, updateProduct);
router.delete("/:id", protect, adminOnly, deleteProduct);

export default router;
