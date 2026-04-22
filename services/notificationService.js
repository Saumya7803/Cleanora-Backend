import Notification from "../models/Notification.js";
import DeviceToken from "../models/DeviceToken.js";
import User from "../models/User.js";
import { sendPushToTokens } from "./fcmService.js";

export const createUserNotification = async ({
  userId,
  type = "system",
  title,
  message,
  data = {},
}) => {
  if (!userId) {
    return null;
  }

  const notification = await Notification.create({
    user: userId,
    type,
    title,
    message,
    data,
    deliveryStatus: "queued",
  });

  const deviceTokens = await DeviceToken.find({ user: userId, isActive: true }).lean();
  const pushResult = await sendPushToTokens({
    tokens: deviceTokens.map((item) => item.token),
    title,
    message,
    data,
  });

  if (pushResult.invalidTokens.length > 0) {
    await DeviceToken.updateMany(
      { token: { $in: pushResult.invalidTokens } },
      { $set: { isActive: false } },
    );
  }

  notification.deliveryStatus =
    pushResult.enabled && pushResult.sentCount > 0 ? "sent" : "queued";
  await notification.save();

  return notification;
};

export const createOrderUpdateNotification = async ({ order, title, message }) =>
  createUserNotification({
    userId: order.user,
    type: "order_update",
    title,
    message,
    data: {
      orderId: order._id,
      status: order.status,
      totalAmount: order.totalAmount,
    },
  });

export const createOfferBroadcast = async ({ title, message, data = {} }) => {
  const users = await User.find({ role: "customer" }).select("_id").lean();
  if (users.length === 0) {
    return 0;
  }

  await Notification.insertMany(
    users.map((user) => ({
      user: user._id,
      type: "offer",
      title,
      message,
      data,
      deliveryStatus: "queued",
    })),
  );

  const userIds = users.map((user) => user._id);
  const deviceTokens = await DeviceToken.find({
    user: { $in: userIds },
    isActive: true,
  }).lean();

  const pushResult = await sendPushToTokens({
    tokens: deviceTokens.map((item) => item.token),
    title,
    message,
    data,
  });

  if (pushResult.invalidTokens.length > 0) {
    await DeviceToken.updateMany(
      { token: { $in: pushResult.invalidTokens } },
      { $set: { isActive: false } },
    );
  }

  await Notification.updateMany(
    { user: { $in: userIds }, title, message, type: "offer", deliveryStatus: "queued" },
    { $set: { deliveryStatus: pushResult.enabled ? "sent" : "queued" } },
  );

  return users.length;
};

export const createPriceDropNotification = async ({ userId, product }) =>
  createUserNotification({
    userId,
    type: "price_drop",
    title: "Price Dropped",
    message: `${product.name} is now available at a lower price.`,
    data: {
      productId: product._id,
      productName: product.name,
      price: product.price,
    },
  });

export const createBackInStockNotification = async ({ userId, product }) =>
  createUserNotification({
    userId,
    type: "back_in_stock",
    title: "Back In Stock",
    message: `${product.name} is back in stock.`,
    data: {
      productId: product._id,
      productName: product.name,
      stock: product.stock,
    },
  });
