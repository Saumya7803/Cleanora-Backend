import {
  ADMIN_ROLES,
  ADMIN_ROLE_DEFAULT_PERMISSIONS,
  ALL_PERMISSIONS,
  getDefaultAdminRole,
  normalizeAdminRole,
  normalizeSystemRole,
  resolvePermissions,
  sanitizePermissions,
} from "../config/adminPermissions.js";
import asyncHandler from "../middleware/asyncHandler.js";
import { ApiError } from "../middleware/errorMiddleware.js";
import AuditLog from "../models/AuditLog.js";
import User from "../models/User.js";
import { createAuditLog } from "../utils/auditLog.js";
import { ensureObjectId, toSafeString, toBoolean } from "../utils/adminUtils.js";
import { buildPaginationMeta, getPagination } from "../utils/pagination.js";

const parsePermissionList = (permissions) => {
  if (Array.isArray(permissions) && permissions.some((permission) => String(permission || "").trim() === "*")) {
    return [...ALL_PERMISSIONS];
  }

  return sanitizePermissions(permissions);
};

export const getPermissionCatalog = asyncHandler(async (_req, res) => {
  res.status(200).json({
    success: true,
    data: {
      permissions: ALL_PERMISSIONS,
      roleDefaults: ADMIN_ROLE_DEFAULT_PERMISSIONS,
      adminRoles: Object.values(ADMIN_ROLES),
    },
  });
});

export const listAdminUsers = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const query = { role: { $in: ["admin", "super_admin"] } };

  if (req.query.search) {
    const search = String(req.query.search).trim();
    query.$or = [
      { name: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
    ];
  }

  const [users, total] = await Promise.all([
    User.find(query)
      .select("name email role adminRole permissions isBlocked phone createdAt updatedAt")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    User.countDocuments(query),
  ]);

  const data = users.map((user) => ({
    ...user,
    permissions: resolvePermissions(user),
  }));

  res.status(200).json({
    success: true,
    data,
    pagination: buildPaginationMeta({ page, limit, total }),
  });
});

export const createAdminUser = asyncHandler(async (req, res) => {
  const { name, email, password, role, adminRole, permissions } = req.body;

  if (!name || !email || !password) {
    throw new ApiError("name, email and password are required", 400);
  }

  const normalizedRole = normalizeSystemRole(role || "admin");
  if (!["admin", "super_admin"].includes(normalizedRole)) {
    throw new ApiError("role must be admin or super_admin", 400);
  }

  if (normalizedRole === "super_admin" && normalizeSystemRole(req.user.role) !== "super_admin") {
    throw new ApiError("Only super admin can create super admin users", 403);
  }

  const existing = await User.findOne({ email: String(email).trim().toLowerCase() });
  if (existing) {
    throw new ApiError("An account already exists for this email", 409);
  }

  const normalizedAdminRole = normalizeAdminRole({
    role: normalizedRole,
    adminRole: adminRole || getDefaultAdminRole(normalizedRole),
  });

  const user = await User.create({
    name: String(name).trim(),
    email: String(email).trim().toLowerCase(),
    password: String(password),
    role: normalizedRole,
    adminRole: normalizedAdminRole,
    permissions: parsePermissionList(permissions),
    isBlocked: false,
  });

  await createAuditLog({
    req,
    action: "admin_user_created",
    module: "access",
    targetType: "User",
    targetId: user._id,
    metadata: {
      role: user.role,
      adminRole: user.adminRole,
      email: user.email,
    },
  });

  res.status(201).json({
    success: true,
    message: "Admin user created",
    data: {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      adminRole: user.adminRole,
      permissions: resolvePermissions(user),
      isBlocked: user.isBlocked,
      createdAt: user.createdAt,
    },
  });
});

export const updateAdminUser = asyncHandler(async (req, res) => {
  ensureObjectId(req.params.id, "user id");

  const user = await User.findById(req.params.id);
  if (!user) {
    throw new ApiError("User not found", 404);
  }

  if (!["admin", "super_admin"].includes(normalizeSystemRole(user.role))) {
    throw new ApiError("Only admin accounts can be updated from this API", 400);
  }

  if (String(user._id) === String(req.user._id) && Object.prototype.hasOwnProperty.call(req.body, "isBlocked")) {
    throw new ApiError("You cannot block your own account", 400);
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "name")) {
    user.name = toSafeString(req.body.name) || user.name;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "role")) {
    const normalizedRole = normalizeSystemRole(req.body.role);
    if (!["admin", "super_admin"].includes(normalizedRole)) {
      throw new ApiError("role must be admin or super_admin", 400);
    }

    if (normalizedRole === "super_admin" && normalizeSystemRole(req.user.role) !== "super_admin") {
      throw new ApiError("Only super admin can assign super_admin role", 403);
    }

    user.role = normalizedRole;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "adminRole")) {
    user.adminRole = normalizeAdminRole({
      role: user.role,
      adminRole: req.body.adminRole,
    });
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "permissions")) {
    user.permissions = parsePermissionList(req.body.permissions);
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "isBlocked")) {
    user.isBlocked = toBoolean(req.body.isBlocked);
  }

  if (typeof req.body.newPassword === "string" && req.body.newPassword.trim()) {
    if (String(req.body.newPassword).trim().length < 6) {
      throw new ApiError("newPassword must be at least 6 characters", 400);
    }
    user.password = String(req.body.newPassword).trim();
  }

  await user.save();

  await createAuditLog({
    req,
    action: "admin_user_updated",
    module: "access",
    targetType: "User",
    targetId: user._id,
    metadata: {
      role: user.role,
      adminRole: user.adminRole,
      isBlocked: user.isBlocked,
      permissions: resolvePermissions(user),
    },
  });

  res.status(200).json({
    success: true,
    message: "Admin user updated",
    data: {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      adminRole: user.adminRole,
      permissions: resolvePermissions(user),
      isBlocked: user.isBlocked,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    },
  });
});

export const listAuditLogs = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const query = {};

  if (req.query.module) {
    query.module = String(req.query.module).trim();
  }

  if (req.query.actorId) {
    ensureObjectId(req.query.actorId, "actor id");
    query.actor = req.query.actorId;
  }

  if (req.query.action) {
    query.action = String(req.query.action).trim();
  }

  const [logs, total] = await Promise.all([
    AuditLog.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    AuditLog.countDocuments(query),
  ]);

  res.status(200).json({
    success: true,
    data: logs,
    pagination: buildPaginationMeta({ page, limit, total }),
  });
});
