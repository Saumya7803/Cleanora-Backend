import jwt from "jsonwebtoken";

import { hasAnyPermission, isElevatedRole, normalizeSystemRole } from "../config/adminPermissions.js";
import User from "../models/User.js";
import asyncHandler from "./asyncHandler.js";
import { ApiError } from "./errorMiddleware.js";

export const protect = asyncHandler(async (req, _res, next) => {
  const authorization = req.headers.authorization;

  if (!authorization || !authorization.startsWith("Bearer ")) {
    throw new ApiError("Access denied. Missing bearer token.", 401);
  }

  const token = authorization.split(" ")[1];

  if (!process.env.JWT_SECRET) {
    throw new ApiError("JWT secret is not configured on the server.", 500);
  }

  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  const user = await User.findById(decoded.userId).select("-password");

  if (!user) {
    throw new ApiError("Invalid token. User no longer exists.", 401);
  }

  if (isElevatedRole(user.role) && user.isBlocked) {
    throw new ApiError("This admin account is blocked. Contact super admin.", 403);
  }

  req.user = user;
  next();
});

export const adminOnly = (req, _res, next) => {
  const normalizedRole = normalizeSystemRole(req.user?.role);
  if (!req.user || (normalizedRole !== "admin" && normalizedRole !== "super_admin")) {
    return next(new ApiError("Admin privileges required.", 403));
  }

  if (req.user.isBlocked) {
    return next(new ApiError("This admin account is blocked.", 403));
  }

  return next();
};

export const superAdminOnly = (req, _res, next) => {
  if (!req.user || normalizeSystemRole(req.user.role) !== "super_admin") {
    return next(new ApiError("Super admin privileges required.", 403));
  }

  if (req.user.isBlocked) {
    return next(new ApiError("This admin account is blocked.", 403));
  }

  return next();
};

export const requirePermission = (permissions, options = {}) => {
  const requiredPermissions = Array.isArray(permissions) ? permissions : [permissions];
  const match = options.match === "all" ? "all" : "any";

  return (req, _res, next) => {
    if (!req.user || !isElevatedRole(req.user.role) || req.user.isBlocked) {
      return next(new ApiError("Admin privileges required.", 403));
    }

    const canAccess =
      match === "all"
        ? requiredPermissions.every((permission) => hasAnyPermission(req.user, [permission]))
        : hasAnyPermission(req.user, requiredPermissions);

    if (!canAccess) {
      return next(new ApiError("You don't have permission to perform this action.", 403));
    }

    return next();
  };
};
