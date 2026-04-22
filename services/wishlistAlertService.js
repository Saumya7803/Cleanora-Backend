import Wishlist from "../models/Wishlist.js";
import { createBackInStockNotification, createPriceDropNotification } from "./notificationService.js";

const normalizePrice = (value) => {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeStock = (value) => {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const notifyWishlistAlertsForProduct = async (product) => {
  if (!product?._id) {
    return { priceDropAlerts: 0, backInStockAlerts: 0 };
  }

  const wishlists = await Wishlist.find({ "items.product": product._id });
  if (!wishlists.length) {
    return { priceDropAlerts: 0, backInStockAlerts: 0 };
  }

  const currentPrice = normalizePrice(product.price);
  const currentStock = normalizeStock(product.stock);

  let priceDropAlerts = 0;
  let backInStockAlerts = 0;

  for (const wishlist of wishlists) {
    const item = wishlist.items.find((entry) => String(entry.product) === String(product._id));
    if (!item) {
      continue;
    }

    const previousKnownPrice = normalizePrice(item.lastKnownPrice || item.priceAtAdded);
    const wasOutOfStock = item.wasOutOfStock === true;
    const isNowOutOfStock = currentStock <= 0;

    if (currentPrice > 0 && previousKnownPrice > 0 && currentPrice < previousKnownPrice) {
      await createPriceDropNotification({
        userId: wishlist.user,
        product,
      });
      item.lastPriceDropAlertAt = new Date();
      priceDropAlerts += 1;
    }

    if (wasOutOfStock && !isNowOutOfStock) {
      await createBackInStockNotification({
        userId: wishlist.user,
        product,
      });
      item.lastBackInStockAlertAt = new Date();
      backInStockAlerts += 1;
    }

    item.lastKnownPrice = currentPrice;
    item.wasOutOfStock = isNowOutOfStock;
    await wishlist.save();
  }

  return { priceDropAlerts, backInStockAlerts };
};
