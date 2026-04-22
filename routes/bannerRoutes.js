import express from "express";

import { listActiveBanners } from "../controllers/adminBannerController.js";

const router = express.Router();

router.get("/active", listActiveBanners);

export default router;
