import express from "express";

import {
  addToWishlist,
  getWishlist,
  moveWishlistItemToCart,
  removeFromWishlist,
  shareWishlist,
} from "../controllers/wishlistController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", protect, getWishlist);
router.get("/share", protect, shareWishlist);
router.post("/items", protect, addToWishlist);
router.delete("/items/:productId", protect, removeFromWishlist);
router.post("/items/:productId/move-to-cart", protect, moveWishlistItemToCart);

export default router;
