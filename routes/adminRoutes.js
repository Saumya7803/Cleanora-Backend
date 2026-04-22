import express from "express";

import {
  createAdminUser,
  getPermissionCatalog,
  listAdminUsers,
  listAuditLogs,
  updateAdminUser,
} from "../controllers/adminAccessController.js";
import {
  createBanner,
  deleteBanner,
  listBannersAdmin,
  toggleBannerStatus,
  updateBanner,
} from "../controllers/adminBannerController.js";
import {
  createCampaign,
  listCampaigns,
  updateCampaign,
  updateCampaignStatus,
} from "../controllers/adminCampaignController.js";
import {
  createFraudRule,
  listFraudCases,
  listFraudRules,
  scanOrderForFraud,
  updateFraudCase,
  updateFraudRule,
} from "../controllers/adminFraudController.js";
import {
  listInventoryAlerts,
  listInventoryRules,
  resolveInventoryAlert,
  scanInventoryAlerts,
  upsertInventoryRule,
} from "../controllers/adminInventoryController.js";
import {
  createPincodeRule,
  listPincodeRules,
  updatePincodeRule,
} from "../controllers/adminPincodeController.js";
import {
  listReturnRequests,
  reviewReturnRequest,
  updateReturnRefundStatus,
} from "../controllers/adminReturnsController.js";
import {
  addSupportTicketReply,
  listSupportTickets,
  updateSupportTicket,
} from "../controllers/adminSupportController.js";
import { PERMISSIONS } from "../config/adminPermissions.js";
import { protect, requirePermission } from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(protect);

router.get("/access/permissions", requirePermission(PERMISSIONS.USERS_VIEW), getPermissionCatalog);
router.get("/access/users", requirePermission(PERMISSIONS.USERS_VIEW), listAdminUsers);
router.post("/access/users", requirePermission(PERMISSIONS.USERS_MANAGE), createAdminUser);
router.patch("/access/users/:id", requirePermission(PERMISSIONS.USERS_MANAGE), updateAdminUser);
router.get("/audit-logs", requirePermission(PERMISSIONS.AUDIT_VIEW), listAuditLogs);

router.get("/inventory/rules", requirePermission(PERMISSIONS.INVENTORY_VIEW), listInventoryRules);
router.post("/inventory/rules", requirePermission(PERMISSIONS.INVENTORY_MANAGE_ALERTS), upsertInventoryRule);
router.post("/inventory/scan", requirePermission(PERMISSIONS.INVENTORY_MANAGE_ALERTS), scanInventoryAlerts);
router.get("/inventory/alerts", requirePermission(PERMISSIONS.INVENTORY_VIEW), listInventoryAlerts);
router.patch("/inventory/alerts/:id", requirePermission(PERMISSIONS.INVENTORY_MANAGE_ALERTS), resolveInventoryAlert);

router.get("/support/tickets", requirePermission(PERMISSIONS.SUPPORT_VIEW), listSupportTickets);
router.patch("/support/tickets/:id", requirePermission(PERMISSIONS.SUPPORT_MANAGE), updateSupportTicket);
router.post("/support/tickets/:id/replies", requirePermission(PERMISSIONS.SUPPORT_MANAGE), addSupportTicketReply);

router.get("/pincodes", requirePermission(PERMISSIONS.PINCODE_VIEW), listPincodeRules);
router.post("/pincodes", requirePermission(PERMISSIONS.PINCODE_MANAGE), createPincodeRule);
router.put("/pincodes/:id", requirePermission(PERMISSIONS.PINCODE_MANAGE), updatePincodeRule);

router.get("/banners", requirePermission(PERMISSIONS.BANNERS_VIEW), listBannersAdmin);
router.post("/banners", requirePermission(PERMISSIONS.BANNERS_MANAGE), createBanner);
router.put("/banners/:id", requirePermission(PERMISSIONS.BANNERS_MANAGE), updateBanner);
router.patch("/banners/:id/toggle", requirePermission(PERMISSIONS.BANNERS_MANAGE), toggleBannerStatus);
router.delete("/banners/:id", requirePermission(PERMISSIONS.BANNERS_MANAGE), deleteBanner);

router.get("/campaigns", requirePermission(PERMISSIONS.CAMPAIGNS_VIEW), listCampaigns);
router.post("/campaigns", requirePermission(PERMISSIONS.CAMPAIGNS_MANAGE), createCampaign);
router.put("/campaigns/:id", requirePermission(PERMISSIONS.CAMPAIGNS_MANAGE), updateCampaign);
router.patch("/campaigns/:id/status", requirePermission(PERMISSIONS.CAMPAIGNS_MANAGE), updateCampaignStatus);

router.get("/fraud/rules", requirePermission(PERMISSIONS.FRAUD_VIEW), listFraudRules);
router.post("/fraud/rules", requirePermission(PERMISSIONS.FRAUD_MANAGE), createFraudRule);
router.put("/fraud/rules/:id", requirePermission(PERMISSIONS.FRAUD_MANAGE), updateFraudRule);
router.get("/fraud/cases", requirePermission(PERMISSIONS.FRAUD_VIEW), listFraudCases);
router.post("/fraud/scan-order/:orderId", requirePermission(PERMISSIONS.FRAUD_MANAGE), scanOrderForFraud);
router.patch("/fraud/cases/:id", requirePermission(PERMISSIONS.FRAUD_MANAGE), updateFraudCase);

router.get("/returns/requests", requirePermission(PERMISSIONS.RETURNS_VIEW), listReturnRequests);
router.patch("/returns/:orderId/review", requirePermission(PERMISSIONS.RETURNS_MANAGE), reviewReturnRequest);
router.patch("/returns/:orderId/refund", requirePermission(PERMISSIONS.RETURNS_MANAGE), updateReturnRefundStatus);

export default router;
