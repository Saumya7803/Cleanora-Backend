import express from "express";

import {
  createCoupon,
  deleteCoupon,
  getBestCoupon,
  listAvailableCoupons,
  listCoupons,
  updateCoupon,
} from "../controllers/couponController.js";
import { PERMISSIONS } from "../config/adminPermissions.js";
import { protect, requirePermission } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/available", protect, listAvailableCoupons);
router.get("/best", protect, getBestCoupon);
router.get("/", protect, requirePermission(PERMISSIONS.COUPONS_VIEW), listCoupons);
router.post("/", protect, requirePermission(PERMISSIONS.COUPONS_MANAGE), createCoupon);
router.put("/:id", protect, requirePermission(PERMISSIONS.COUPONS_MANAGE), updateCoupon);
router.delete("/:id", protect, requirePermission(PERMISSIONS.COUPONS_MANAGE), deleteCoupon);

export default router;
