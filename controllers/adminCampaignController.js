import mongoose from "mongoose";

import asyncHandler from "../middleware/asyncHandler.js";
import { ApiError } from "../middleware/errorMiddleware.js";
import Campaign from "../models/Campaign.js";
import { createAuditLog } from "../utils/auditLog.js";
import {
  ensureObjectId,
  normalizePincode,
  toArrayOfStrings,
  toDateOrNull,
  toFiniteNumber,
  toSafeString,
} from "../utils/adminUtils.js";
import { buildPaginationMeta, getPagination } from "../utils/pagination.js";

const sanitizeCampaignTarget = (target = {}) => ({
  cities: toArrayOfStrings(target.cities),
  states: toArrayOfStrings(target.states),
  pincodes: toArrayOfStrings(target.pincodes).map(normalizePincode).filter((code) => /^\d{6}$/.test(code)),
  segments: toArrayOfStrings(target.segments),
});

const normalizeCampaignPayload = ({ payload, userId, isCreate = false }) => ({
  name: toSafeString(payload.name),
  code: toSafeString(payload.code).toUpperCase(),
  channel: ["coupon", "banner", "push", "custom"].includes(toSafeString(payload.channel))
    ? toSafeString(payload.channel)
    : "custom",
  description: toSafeString(payload.description),
  status: ["draft", "scheduled", "live", "paused", "completed", "cancelled"].includes(
    toSafeString(payload.status),
  )
    ? toSafeString(payload.status)
    : "draft",
  startAt: toDateOrNull(payload.startAt),
  endAt: toDateOrNull(payload.endAt),
  target: sanitizeCampaignTarget(payload.target),
  budget: Math.max(0, toFiniteNumber(payload.budget, 0)),
  spend: Math.max(0, toFiniteNumber(payload.spend, 0)),
  metrics: {
    impressions: Math.max(0, Math.floor(toFiniteNumber(payload.metrics?.impressions, 0))),
    clicks: Math.max(0, Math.floor(toFiniteNumber(payload.metrics?.clicks, 0))),
    orders: Math.max(0, Math.floor(toFiniteNumber(payload.metrics?.orders, 0))),
    revenue: Math.max(0, toFiniteNumber(payload.metrics?.revenue, 0)),
  },
  assetRefs: {
    bannerIds: Array.isArray(payload.assetRefs?.bannerIds)
      ? payload.assetRefs.bannerIds.filter((id) => mongoose.isValidObjectId(id))
      : [],
    couponCodes: toArrayOfStrings(payload.assetRefs?.couponCodes).map((code) => code.toUpperCase()),
  },
  ...(isCreate ? { createdBy: userId } : {}),
  updatedBy: userId,
});

export const listCampaigns = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const query = {};

  if (req.query.status) {
    query.status = toSafeString(req.query.status);
  }

  if (req.query.channel) {
    query.channel = toSafeString(req.query.channel);
  }

  if (req.query.search) {
    const search = toSafeString(req.query.search);
    query.$or = [
      { name: { $regex: search, $options: "i" } },
      { code: { $regex: search, $options: "i" } },
      { description: { $regex: search, $options: "i" } },
    ];
  }

  const [campaigns, total] = await Promise.all([
    Campaign.find(query)
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Campaign.countDocuments(query),
  ]);

  res.status(200).json({
    success: true,
    data: campaigns,
    pagination: buildPaginationMeta({ page, limit, total }),
  });
});

export const createCampaign = asyncHandler(async (req, res) => {
  const payload = normalizeCampaignPayload({
    payload: req.body,
    userId: req.user._id,
    isCreate: true,
  });

  if (!payload.name) {
    throw new ApiError("name is required", 400);
  }

  const campaign = await Campaign.create(payload);

  await createAuditLog({
    req,
    action: "campaign_created",
    module: "campaigns",
    targetType: "Campaign",
    targetId: campaign._id,
    metadata: {
      name: campaign.name,
      status: campaign.status,
      channel: campaign.channel,
    },
  });

  res.status(201).json({
    success: true,
    message: "Campaign created",
    data: campaign,
  });
});

export const updateCampaign = asyncHandler(async (req, res) => {
  ensureObjectId(req.params.id, "campaign id");

  const campaign = await Campaign.findById(req.params.id);
  if (!campaign) {
    throw new ApiError("Campaign not found", 404);
  }

  const payload = normalizeCampaignPayload({ payload: req.body, userId: req.user._id });

  if (Object.prototype.hasOwnProperty.call(req.body, "name")) {
    campaign.name = payload.name;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "code")) {
    campaign.code = payload.code;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "channel")) {
    campaign.channel = payload.channel;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "description")) {
    campaign.description = payload.description;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "status")) {
    campaign.status = payload.status;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "startAt")) {
    campaign.startAt = payload.startAt;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "endAt")) {
    campaign.endAt = payload.endAt;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "target")) {
    campaign.target = payload.target;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "budget")) {
    campaign.budget = payload.budget;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "spend")) {
    campaign.spend = payload.spend;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "metrics")) {
    campaign.metrics = payload.metrics;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "assetRefs")) {
    campaign.assetRefs = payload.assetRefs;
  }

  campaign.updatedBy = req.user._id;
  await campaign.save();

  await createAuditLog({
    req,
    action: "campaign_updated",
    module: "campaigns",
    targetType: "Campaign",
    targetId: campaign._id,
    metadata: {
      name: campaign.name,
      status: campaign.status,
    },
  });

  res.status(200).json({
    success: true,
    message: "Campaign updated",
    data: campaign,
  });
});

export const updateCampaignStatus = asyncHandler(async (req, res) => {
  ensureObjectId(req.params.id, "campaign id");

  const status = toSafeString(req.body.status);
  if (!["draft", "scheduled", "live", "paused", "completed", "cancelled"].includes(status)) {
    throw new ApiError("Invalid campaign status", 400);
  }

  const campaign = await Campaign.findById(req.params.id);
  if (!campaign) {
    throw new ApiError("Campaign not found", 404);
  }

  campaign.status = status;
  campaign.updatedBy = req.user._id;
  await campaign.save();

  await createAuditLog({
    req,
    action: "campaign_status_updated",
    module: "campaigns",
    targetType: "Campaign",
    targetId: campaign._id,
    metadata: {
      status,
    },
  });

  res.status(200).json({
    success: true,
    message: "Campaign status updated",
    data: campaign,
  });
});
