import mongoose from "mongoose";

import DeviceToken from "../models/DeviceToken.js";
import Notification from "../models/Notification.js";
import asyncHandler from "../middleware/asyncHandler.js";
import { ApiError } from "../middleware/errorMiddleware.js";
import { createOfferBroadcast, createUserNotification } from "../services/notificationService.js";
import { buildPaginationMeta, getPagination } from "../utils/pagination.js";

const ensureObjectId = (value, label) => {
  if (!mongoose.isValidObjectId(value)) {
    throw new ApiError(`Invalid ${label}`, 400);
  }
};

export const getMyNotifications = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const query = { user: req.user._id };

  const [notifications, total, unreadCount] = await Promise.all([
    Notification.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Notification.countDocuments(query),
    Notification.countDocuments({ ...query, isRead: false }),
  ]);

  res.status(200).json({
    success: true,
    data: notifications,
    unreadCount,
    pagination: buildPaginationMeta({ page, limit, total }),
  });
});

export const markNotificationRead = asyncHandler(async (req, res) => {
  ensureObjectId(req.params.id, "notification id");

  const notification = await Notification.findById(req.params.id);
  if (!notification) {
    throw new ApiError("Notification not found", 404);
  }

  if (String(notification.user) !== String(req.user._id)) {
    throw new ApiError("Not authorized to update this notification", 403);
  }

  notification.isRead = true;
  await notification.save();

  res.status(200).json({
    success: true,
    message: "Notification marked as read",
    data: notification,
  });
});

export const markAllNotificationsRead = asyncHandler(async (req, res) => {
  await Notification.updateMany({ user: req.user._id, isRead: false }, { isRead: true });

  res.status(200).json({
    success: true,
    message: "All notifications marked as read",
  });
});

export const registerDeviceToken = asyncHandler(async (req, res) => {
  const token = String(req.body.token || "").trim();
  const platform = String(req.body.platform || "android").trim().toLowerCase();

  if (!token) {
    throw new ApiError("Device token is required", 400);
  }

  if (!["android", "ios", "web"].includes(platform)) {
    throw new ApiError("Invalid platform", 400);
  }

  const deviceToken = await DeviceToken.findOneAndUpdate(
    { token },
    {
      user: req.user._id,
      platform,
      isActive: true,
      lastSeenAt: new Date(),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  res.status(200).json({
    success: true,
    message: "Device token registered",
    data: deviceToken,
  });
});

export const sendOfferNotification = asyncHandler(async (req, res) => {
  const title = String(req.body.title || "").trim();
  const message = String(req.body.message || "").trim();
  const data = req.body.data && typeof req.body.data === "object" ? req.body.data : {};

  if (!title || !message) {
    throw new ApiError("title and message are required", 400);
  }

  const deliveredCount = await createOfferBroadcast({ title, message, data });

  res.status(200).json({
    success: true,
    message: "Offer notification sent",
    data: {
      deliveredCount,
    },
  });
});

export const sendCartReminderNotification = asyncHandler(async (req, res) => {
  const itemCount = Number(req.body.itemCount || 0);
  const totalAmount = Number(req.body.totalAmount || 0);

  if (!Number.isFinite(itemCount) || itemCount <= 0) {
    throw new ApiError("itemCount must be greater than zero", 400);
  }

  await createUserNotification({
    userId: req.user._id,
    type: "cart_reminder",
    title: "Complete your checkout",
    message: `You still have ${itemCount} item(s) worth $${totalAmount.toFixed(2)} in your cart.`,
    data: {
      itemCount,
      totalAmount: Number(totalAmount.toFixed(2)),
    },
  });

  res.status(200).json({
    success: true,
    message: "Cart reminder queued",
  });
});
