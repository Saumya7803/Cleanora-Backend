import express from "express";

import { checkPincode } from "../controllers/adminPincodeController.js";

const router = express.Router();

router.get("/:pincode/check", checkPincode);

export default router;
