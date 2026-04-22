import express from "express";

import {
  getMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  registerDeviceToken,
  sendCartReminderNotification,
  sendOfferNotification,
} from "../controllers/notificationController.js";
import { adminOnly, protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", protect, getMyNotifications);
router.patch("/read-all", protect, markAllNotificationsRead);
router.patch("/:id/read", protect, markNotificationRead);
router.post("/device-token", protect, registerDeviceToken);
router.post("/cart-reminder", protect, sendCartReminderNotification);
router.post("/offers", protect, adminOnly, sendOfferNotification);

export default router;
