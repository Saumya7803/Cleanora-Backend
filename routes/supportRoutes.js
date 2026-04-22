import express from "express";

import { createSupportTicket, listMySupportTickets } from "../controllers/adminSupportController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/tickets", protect, createSupportTicket);
router.get("/tickets/me", protect, listMySupportTickets);

export default router;
