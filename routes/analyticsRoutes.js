import express from "express";

import { getAnalyticsOverview } from "../controllers/analyticsController.js";
import { PERMISSIONS } from "../config/adminPermissions.js";
import { protect, requirePermission } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/overview", protect, requirePermission(PERMISSIONS.ANALYTICS_VIEW), getAnalyticsOverview);

export default router;
