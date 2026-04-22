import express from "express";

import {
  cancelOrder,
  createOrder,
  getAllOrders,
  getMyOrders,
  getOrderById,
  getOrdersByUser,
  reorderOrder,
  requestReturn,
  updateOrderPaymentStatus,
  updateOrderStatus,
} from "../controllers/orderController.js";
import { PERMISSIONS } from "../config/adminPermissions.js";
import { protect, requirePermission } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/", protect, createOrder);
router.get("/me", protect, getMyOrders);
router.get("/", protect, requirePermission(PERMISSIONS.ORDERS_VIEW), getAllOrders);
router.get("/user/:id", protect, getOrdersByUser);
router.get("/:id", protect, getOrderById);
router.post("/:id/reorder", protect, reorderOrder);
router.patch("/:id/cancel", protect, cancelOrder);
router.post("/:id/return", protect, requestReturn);
router.patch("/:id/payment", protect, updateOrderPaymentStatus);
router.patch("/:id/status", protect, requirePermission(PERMISSIONS.ORDERS_MANAGE), updateOrderStatus);

export default router;
