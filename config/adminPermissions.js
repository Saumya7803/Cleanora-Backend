const PERMISSIONS = Object.freeze({
  USERS_VIEW: "users.view",
  USERS_MANAGE: "users.manage",
  AUDIT_VIEW: "audit.view",
  INVENTORY_VIEW: "inventory.view",
  INVENTORY_MANAGE_ALERTS: "inventory.manage_alerts",
  SUPPORT_VIEW: "support.view",
  SUPPORT_MANAGE: "support.manage",
  PINCODE_VIEW: "pincode.view",
  PINCODE_MANAGE: "pincode.manage",
  BANNERS_VIEW: "banners.view",
  BANNERS_MANAGE: "banners.manage",
  CAMPAIGNS_VIEW: "campaigns.view",
  CAMPAIGNS_MANAGE: "campaigns.manage",
  FRAUD_VIEW: "fraud.view",
  FRAUD_MANAGE: "fraud.manage",
  RETURNS_VIEW: "returns.view",
  RETURNS_MANAGE: "returns.manage",
  ORDERS_VIEW: "orders.view",
  ORDERS_MANAGE: "orders.manage",
  COUPONS_VIEW: "coupons.view",
  COUPONS_MANAGE: "coupons.manage",
  ANALYTICS_VIEW: "analytics.view",
});

const ALL_PERMISSIONS = Object.freeze(Object.values(PERMISSIONS));

export const ADMIN_ROLES = Object.freeze({
  SUPER_ADMIN: "super_admin",
  ADMIN: "admin",
  OPERATIONS_MANAGER: "operations_manager",
  SUPPORT_MANAGER: "support_manager",
  MARKETING_MANAGER: "marketing_manager",
  RISK_MANAGER: "risk_manager",
  FINANCE_MANAGER: "finance_manager",
});

export const ADMIN_ROLE_DEFAULT_PERMISSIONS = Object.freeze({
  [ADMIN_ROLES.SUPER_ADMIN]: ["*"],
  [ADMIN_ROLES.ADMIN]: [
    PERMISSIONS.USERS_VIEW,
    PERMISSIONS.AUDIT_VIEW,
    PERMISSIONS.INVENTORY_VIEW,
    PERMISSIONS.INVENTORY_MANAGE_ALERTS,
    PERMISSIONS.SUPPORT_VIEW,
    PERMISSIONS.SUPPORT_MANAGE,
    PERMISSIONS.PINCODE_VIEW,
    PERMISSIONS.PINCODE_MANAGE,
    PERMISSIONS.BANNERS_VIEW,
    PERMISSIONS.BANNERS_MANAGE,
    PERMISSIONS.CAMPAIGNS_VIEW,
    PERMISSIONS.CAMPAIGNS_MANAGE,
    PERMISSIONS.FRAUD_VIEW,
    PERMISSIONS.FRAUD_MANAGE,
    PERMISSIONS.RETURNS_VIEW,
    PERMISSIONS.RETURNS_MANAGE,
    PERMISSIONS.ORDERS_VIEW,
    PERMISSIONS.ORDERS_MANAGE,
    PERMISSIONS.COUPONS_VIEW,
    PERMISSIONS.COUPONS_MANAGE,
    PERMISSIONS.ANALYTICS_VIEW,
  ],
  [ADMIN_ROLES.OPERATIONS_MANAGER]: [
    PERMISSIONS.INVENTORY_VIEW,
    PERMISSIONS.INVENTORY_MANAGE_ALERTS,
    PERMISSIONS.PINCODE_VIEW,
    PERMISSIONS.PINCODE_MANAGE,
    PERMISSIONS.RETURNS_VIEW,
    PERMISSIONS.RETURNS_MANAGE,
    PERMISSIONS.ORDERS_VIEW,
    PERMISSIONS.ORDERS_MANAGE,
  ],
  [ADMIN_ROLES.SUPPORT_MANAGER]: [
    PERMISSIONS.SUPPORT_VIEW,
    PERMISSIONS.SUPPORT_MANAGE,
    PERMISSIONS.RETURNS_VIEW,
    PERMISSIONS.ORDERS_VIEW,
  ],
  [ADMIN_ROLES.MARKETING_MANAGER]: [
    PERMISSIONS.BANNERS_VIEW,
    PERMISSIONS.BANNERS_MANAGE,
    PERMISSIONS.CAMPAIGNS_VIEW,
    PERMISSIONS.CAMPAIGNS_MANAGE,
    PERMISSIONS.COUPONS_VIEW,
    PERMISSIONS.COUPONS_MANAGE,
    PERMISSIONS.ANALYTICS_VIEW,
  ],
  [ADMIN_ROLES.RISK_MANAGER]: [
    PERMISSIONS.FRAUD_VIEW,
    PERMISSIONS.FRAUD_MANAGE,
    PERMISSIONS.AUDIT_VIEW,
    PERMISSIONS.ORDERS_VIEW,
  ],
  [ADMIN_ROLES.FINANCE_MANAGER]: [
    PERMISSIONS.RETURNS_VIEW,
    PERMISSIONS.RETURNS_MANAGE,
    PERMISSIONS.ORDERS_VIEW,
    PERMISSIONS.COUPONS_VIEW,
    PERMISSIONS.ANALYTICS_VIEW,
  ],
});

const normalizeString = (value) => String(value || "").trim().toLowerCase();

export const normalizeSystemRole = (role) => {
  const normalized = normalizeString(role);
  if (normalized === "admin" || normalized === "super_admin") {
    return normalized;
  }
  return "customer";
};

export const isElevatedRole = (role) => {
  const normalized = normalizeSystemRole(role);
  return normalized === "admin" || normalized === "super_admin";
};

export const getDefaultAdminRole = (role) => {
  const normalized = normalizeSystemRole(role);
  if (normalized === "super_admin") {
    return ADMIN_ROLES.SUPER_ADMIN;
  }

  if (normalized === "admin") {
    return ADMIN_ROLES.ADMIN;
  }

  return null;
};

const availableAdminRoles = new Set(Object.values(ADMIN_ROLES));

export const normalizeAdminRole = ({ role, adminRole }) => {
  const normalizedRole = normalizeSystemRole(role);
  if (!isElevatedRole(normalizedRole)) {
    return null;
  }

  const fallbackRole = getDefaultAdminRole(normalizedRole);
  const normalizedAdminRole = normalizeString(adminRole);
  if (availableAdminRoles.has(normalizedAdminRole)) {
    return normalizedAdminRole;
  }

  return fallbackRole;
};

export const sanitizePermissions = (permissions) => {
  if (!Array.isArray(permissions)) {
    return [];
  }

  const validPermissions = new Set(ALL_PERMISSIONS);
  return Array.from(
    new Set(
      permissions
        .map((permission) => String(permission || "").trim())
        .filter((permission) => validPermissions.has(permission)),
    ),
  );
};

export const resolvePermissions = ({ role, adminRole, permissions }) => {
  const normalizedRole = normalizeSystemRole(role);
  if (!isElevatedRole(normalizedRole)) {
    return [];
  }

  if (normalizedRole === "super_admin" || normalizeAdminRole({ role, adminRole }) === ADMIN_ROLES.SUPER_ADMIN) {
    return [...ALL_PERMISSIONS];
  }

  const resolvedAdminRole = normalizeAdminRole({ role, adminRole });
  const roleDefaults = ADMIN_ROLE_DEFAULT_PERMISSIONS[resolvedAdminRole] || [];
  const customPermissions = sanitizePermissions(permissions);

  if (roleDefaults.includes("*")) {
    return [...ALL_PERMISSIONS];
  }

  return Array.from(new Set([...roleDefaults, ...customPermissions]));
};

export const hasPermission = (user, permission) => {
  if (!permission) {
    return true;
  }

  const permissions = resolvePermissions(user || {});
  if (!permissions.length) {
    return false;
  }

  return permissions.includes(permission);
};

export const hasAnyPermission = (user, permissions = []) => {
  if (!permissions.length) {
    return true;
  }

  return permissions.some((permission) => hasPermission(user, permission));
};

export { ALL_PERMISSIONS, PERMISSIONS };
