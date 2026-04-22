import asyncHandler from "../middleware/asyncHandler.js";
import { ApiError } from "../middleware/errorMiddleware.js";
import Banner from "../models/Banner.js";
import { createAuditLog } from "../utils/auditLog.js";
import {
  ensureObjectId,
  toArrayOfStrings,
  toBoolean,
  toDateOrNull,
  toFiniteNumber,
  toSafeString,
} from "../utils/adminUtils.js";

const normalizeBannerPayload = ({ payload, userId, isCreate = false }) => {
  const normalized = {
    title: toSafeString(payload.title),
    subtitle: toSafeString(payload.subtitle),
    imageUrl: toSafeString(payload.imageUrl),
    ctaLabel: toSafeString(payload.ctaLabel),
    ctaLink: toSafeString(payload.ctaLink),
    priority: Math.floor(toFiniteNumber(payload.priority, 0)),
    isActive: toBoolean(payload.isActive, true),
    startAt: toDateOrNull(payload.startAt) || new Date(),
    endAt: toDateOrNull(payload.endAt),
    tags: toArrayOfStrings(payload.tags),
    updatedBy: userId,
  };

  if (isCreate) {
    normalized.createdBy = userId;
  }

  return normalized;
};

export const listBannersAdmin = asyncHandler(async (_req, res) => {
  const banners = await Banner.find({}).sort({ priority: -1, updatedAt: -1 }).lean();

  res.status(200).json({
    success: true,
    data: banners,
  });
});

export const listActiveBanners = asyncHandler(async (_req, res) => {
  const now = new Date();
  const banners = await Banner.find({
    isActive: true,
    startAt: { $lte: now },
    $or: [{ endAt: null }, { endAt: { $gte: now } }],
  })
    .sort({ priority: -1, updatedAt: -1 })
    .lean();

  res.status(200).json({
    success: true,
    data: banners,
  });
});

export const createBanner = asyncHandler(async (req, res) => {
  const payload = normalizeBannerPayload({ payload: req.body, userId: req.user._id, isCreate: true });

  if (!payload.title || !payload.imageUrl) {
    throw new ApiError("title and imageUrl are required", 400);
  }

  const banner = await Banner.create(payload);

  await createAuditLog({
    req,
    action: "banner_created",
    module: "banners",
    targetType: "Banner",
    targetId: banner._id,
    metadata: {
      title: banner.title,
      isActive: banner.isActive,
      priority: banner.priority,
    },
  });

  res.status(201).json({
    success: true,
    message: "Banner created",
    data: banner,
  });
});

export const updateBanner = asyncHandler(async (req, res) => {
  ensureObjectId(req.params.id, "banner id");

  const banner = await Banner.findById(req.params.id);
  if (!banner) {
    throw new ApiError("Banner not found", 404);
  }

  const payload = normalizeBannerPayload({ payload: req.body, userId: req.user._id });

  if (Object.prototype.hasOwnProperty.call(req.body, "title")) {
    banner.title = payload.title;
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "subtitle")) {
    banner.subtitle = payload.subtitle;
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "imageUrl")) {
    banner.imageUrl = payload.imageUrl;
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "ctaLabel")) {
    banner.ctaLabel = payload.ctaLabel;
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "ctaLink")) {
    banner.ctaLink = payload.ctaLink;
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "priority")) {
    banner.priority = payload.priority;
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "isActive")) {
    banner.isActive = payload.isActive;
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "startAt")) {
    banner.startAt = payload.startAt;
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "endAt")) {
    banner.endAt = payload.endAt;
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "tags")) {
    banner.tags = payload.tags;
  }

  banner.updatedBy = req.user._id;
  await banner.save();

  await createAuditLog({
    req,
    action: "banner_updated",
    module: "banners",
    targetType: "Banner",
    targetId: banner._id,
    metadata: {
      title: banner.title,
      isActive: banner.isActive,
      priority: banner.priority,
    },
  });

  res.status(200).json({
    success: true,
    message: "Banner updated",
    data: banner,
  });
});

export const toggleBannerStatus = asyncHandler(async (req, res) => {
  ensureObjectId(req.params.id, "banner id");

  const banner = await Banner.findById(req.params.id);
  if (!banner) {
    throw new ApiError("Banner not found", 404);
  }

  banner.isActive = !banner.isActive;
  banner.updatedBy = req.user._id;
  await banner.save();

  await createAuditLog({
    req,
    action: "banner_toggled",
    module: "banners",
    targetType: "Banner",
    targetId: banner._id,
    metadata: {
      isActive: banner.isActive,
    },
  });

  res.status(200).json({
    success: true,
    message: `Banner ${banner.isActive ? "activated" : "deactivated"}`,
    data: banner,
  });
});

export const deleteBanner = asyncHandler(async (req, res) => {
  ensureObjectId(req.params.id, "banner id");

  const banner = await Banner.findByIdAndDelete(req.params.id);
  if (!banner) {
    throw new ApiError("Banner not found", 404);
  }

  await createAuditLog({
    req,
    action: "banner_deleted",
    module: "banners",
    targetType: "Banner",
    targetId: banner._id,
    metadata: {
      title: banner.title,
    },
  });

  res.status(200).json({
    success: true,
    message: "Banner deleted",
    data: {
      _id: banner._id,
      title: banner.title,
    },
  });
});
