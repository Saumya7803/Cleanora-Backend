import Coupon from "../models/Coupon.js";
import asyncHandler from "../middleware/asyncHandler.js";
import { ApiError } from "../middleware/errorMiddleware.js";
import { calculateCouponDiscount } from "../utils/pricing.js";

const normalizeCouponPayload = (body) => ({
  code: String(body.code || "").trim().toUpperCase(),
  description: String(body.description || "").trim(),
  discountType: body.discountType === "flat" ? "flat" : "percent",
  discountValue: Number(body.discountValue || 0),
  maxDiscountAmount:
    typeof body.maxDiscountAmount === "number" || typeof body.maxDiscountAmount === "string"
      ? Number(body.maxDiscountAmount)
      : null,
  minOrderAmount: Number(body.minOrderAmount || 0),
  validFrom: body.validFrom ? new Date(body.validFrom) : new Date(),
  validUntil: body.validUntil ? new Date(body.validUntil) : null,
  isActive: typeof body.isActive === "boolean" ? body.isActive : true,
});

export const listCoupons = asyncHandler(async (_req, res) => {
  const coupons = await Coupon.find({}).sort({ createdAt: -1 }).lean();
  res.status(200).json({
    success: true,
    data: coupons,
  });
});

export const listAvailableCoupons = asyncHandler(async (req, res) => {
  const cartTotal = Number(req.query.cartTotal || 0);
  const now = new Date();

  const coupons = await Coupon.find({
    isActive: true,
    validFrom: { $lte: now },
    $or: [{ validUntil: null }, { validUntil: { $gte: now } }],
  })
    .sort({ discountValue: -1, createdAt: -1 })
    .lean();

  const enriched = coupons.map((coupon) => {
    const discountPreview = calculateCouponDiscount({
      subtotal: cartTotal,
      coupon,
    });
    return {
      ...coupon,
      isApplicable: cartTotal >= Number(coupon.minOrderAmount || 0) && discountPreview > 0,
      discountPreview: Number(discountPreview.toFixed(2)),
      isExpired: coupon.validUntil ? new Date(coupon.validUntil) < now : false,
    };
  });

  res.status(200).json({
    success: true,
    data: enriched,
  });
});

export const getBestCoupon = asyncHandler(async (req, res) => {
  const cartTotal = Number(req.query.cartTotal || 0);
  if (!Number.isFinite(cartTotal) || cartTotal <= 0) {
    throw new ApiError("cartTotal query parameter is required", 400);
  }

  const now = new Date();
  const coupons = await Coupon.find({
    isActive: true,
    validFrom: { $lte: now },
    $or: [{ validUntil: null }, { validUntil: { $gte: now } }],
  }).lean();

  let bestCoupon = null;
  let bestDiscount = 0;

  for (const coupon of coupons) {
    const discount = calculateCouponDiscount({ subtotal: cartTotal, coupon });
    if (discount > bestDiscount) {
      bestDiscount = discount;
      bestCoupon = coupon;
    }
  }

  res.status(200).json({
    success: true,
    data: {
      coupon: bestCoupon,
      discountAmount: Number(bestDiscount.toFixed(2)),
    },
  });
});

export const createCoupon = asyncHandler(async (req, res) => {
  const payload = normalizeCouponPayload(req.body);
  if (!payload.code || payload.discountValue <= 0) {
    throw new ApiError("code and positive discountValue are required", 400);
  }

  const coupon = await Coupon.create(payload);

  res.status(201).json({
    success: true,
    message: "Coupon created",
    data: coupon,
  });
});

export const updateCoupon = asyncHandler(async (req, res) => {
  const payload = normalizeCouponPayload(req.body);
  const coupon = await Coupon.findById(req.params.id);
  if (!coupon) {
    throw new ApiError("Coupon not found", 404);
  }

  Object.assign(coupon, payload);
  await coupon.save();

  res.status(200).json({
    success: true,
    message: "Coupon updated",
    data: coupon,
  });
});

export const deleteCoupon = asyncHandler(async (req, res) => {
  const coupon = await Coupon.findByIdAndDelete(req.params.id);
  if (!coupon) {
    throw new ApiError("Coupon not found", 404);
  }

  res.status(200).json({
    success: true,
    message: "Coupon deleted",
    data: {
      _id: coupon._id,
      code: coupon.code,
    },
  });
});
