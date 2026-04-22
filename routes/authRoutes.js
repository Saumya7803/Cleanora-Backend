import express from "express";

import {
  changePassword,
  getProfile,
  login,
  logout,
  register,
  updateProfile,
} from "../controllers/authController.js";
import { protect } from "../middleware/authMiddleware.js";
import { loginRateLimit } from "../middleware/loginRateLimit.js";

const router = express.Router();

router.post("/login", loginRateLimit, login);
router.post("/register", register);
router.get("/me", protect, getProfile);
router.put("/me", protect, updateProfile);
router.put("/change-password", protect, changePassword);
router.post("/logout", protect, logout);

export default router;
