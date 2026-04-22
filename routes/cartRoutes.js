import express from "express";

import {
  addCartItem,
  applyCouponToCart,
  clearCart,
  getMyCart,
  removeCartItem,
  removeCouponFromCart,
  syncCart,
  updateCartItem,
} from "../controllers/cartController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", protect, getMyCart);
router.put("/sync", protect, syncCart);
router.post("/items", protect, addCartItem);
router.patch("/items/:productId", protect, updateCartItem);
router.delete("/items/:productId", protect, removeCartItem);
router.post("/coupon", protect, applyCouponToCart);
router.delete("/coupon", protect, removeCouponFromCart);
router.delete("/clear", protect, clearCart);

export default router;
