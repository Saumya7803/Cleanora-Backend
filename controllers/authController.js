import User from "../models/User.js";
import {
  getDefaultAdminRole,
  normalizeAdminRole,
  normalizeSystemRole,
  resolvePermissions,
  sanitizePermissions,
} from "../config/adminPermissions.js";
import generateToken from "../utils/generateToken.js";
import asyncHandler from "../middleware/asyncHandler.js";
import { ApiError } from "../middleware/errorMiddleware.js";
import { clearLoginFailures, recordLoginFailure } from "../middleware/loginRateLimit.js";

const toAuthResponse = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  role: normalizeSystemRole(user.role),
  adminRole: normalizeAdminRole({
    role: user.role,
    adminRole: user.adminRole,
  }),
  permissions: resolvePermissions(user),
  isBlocked: Boolean(user.isBlocked),
  phone: user.phone || "",
  avatarUrl: user.avatarUrl || "",
});

export const register = asyncHandler(async (req, res) => {
  const { name, email, password, role, adminRole, permissions, adminSecret } = req.body;
  const requestedRole = String(role || "customer").trim().toLowerCase();

  if (!name || !email || !password) {
    throw new ApiError("name, email, and password are required", 400);
  }

  const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
  if (existingUser) {
    throw new ApiError("An account already exists for this email", 409);
  }

  let userRole = "customer";
  if (requestedRole === "admin" || requestedRole === "super_admin") {
    const allowedSecrets =
      requestedRole === "super_admin"
        ? [
            process.env.SUPER_ADMIN_REGISTRATION_SECRET,
            process.env.ADMIN_REGISTRATION_SECRET,
          ].filter(Boolean)
        : [process.env.ADMIN_REGISTRATION_SECRET].filter(Boolean);

    if (!allowedSecrets.length || !allowedSecrets.includes(adminSecret)) {
      throw new ApiError("Invalid admin registration secret", 403);
    }
    userRole = requestedRole;
  }

  const user = await User.create({
    name: name.trim(),
    email: email.toLowerCase().trim(),
    password,
    role: userRole,
    adminRole: normalizeAdminRole({
      role: userRole,
      adminRole: adminRole || getDefaultAdminRole(userRole),
    }),
    permissions: sanitizePermissions(permissions),
  });

  const token = generateToken(user);

  res.status(201).json({
    success: true,
    message: "Registration successful",
    data: {
      token,
      user: toAuthResponse(user),
    },
  });
});

export const getProfile = asyncHandler(async (req, res) => {
  res.status(200).json({
    success: true,
    data: toAuthResponse(req.user),
  });
});

export const updateProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select("-password");
  if (!user) {
    throw new ApiError("User not found", 404);
  }

  const { name, phone, avatarUrl } = req.body;

  if (typeof name === "string" && name.trim()) {
    user.name = name.trim();
  }

  if (typeof phone === "string") {
    user.phone = phone.trim();
  }

  if (typeof avatarUrl === "string") {
    user.avatarUrl = avatarUrl.trim();
  }

  await user.save();

  res.status(200).json({
    success: true,
    message: "Profile updated",
    data: toAuthResponse(user),
  });
});

export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    throw new ApiError("currentPassword and newPassword are required", 400);
  }

  if (newPassword.length < 6) {
    throw new ApiError("New password must be at least 6 characters", 400);
  }

  if (currentPassword === newPassword) {
    throw new ApiError("New password must be different from current password", 400);
  }

  const user = await User.findById(req.user._id).select("+password");
  if (!user) {
    throw new ApiError("User not found", 404);
  }

  const isCurrentPasswordValid = await user.comparePassword(currentPassword);
  if (!isCurrentPasswordValid) {
    throw new ApiError("Current password is incorrect", 401);
  }

  user.password = newPassword;
  await user.save();

  res.status(200).json({
    success: true,
    message: "Password updated successfully",
  });
});

export const logout = asyncHandler(async (_req, res) => {
  res.status(200).json({
    success: true,
    message: "Logout successful",
  });
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new ApiError("email and password are required", 400);
  }

  const user = await User.findOne({ email: email.toLowerCase().trim() }).select("+password");
  if (!user) {
    recordLoginFailure(req);
    throw new ApiError("Invalid credentials", 401);
  }

  const isPasswordValid = await user.comparePassword(password);
  if (!isPasswordValid) {
    recordLoginFailure(req);
    throw new ApiError("Invalid credentials", 401);
  }

  if (["admin", "super_admin"].includes(normalizeSystemRole(user.role)) && user.isBlocked) {
    throw new ApiError("This admin account is blocked. Contact super admin.", 403);
  }

  clearLoginFailures(req);
  const token = generateToken(user);

  res.status(200).json({
    success: true,
    message: "Login successful",
    data: {
      token,
      user: toAuthResponse(user),
    },
  });
});
