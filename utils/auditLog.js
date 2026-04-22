import AuditLog from "../models/AuditLog.js";

const sanitizeMetadata = (metadata) => {
  if (!metadata || typeof metadata !== "object") {
    return {};
  }

  try {
    return JSON.parse(JSON.stringify(metadata));
  } catch {
    return {};
  }
};

export const createAuditLog = async ({
  req,
  action,
  module,
  targetType,
  targetId,
  metadata,
}) => {
  if (!action) {
    return null;
  }

  return AuditLog.create({
    actor: req?.user?._id || null,
    actorEmail: req?.user?.email || "",
    actorRole: req?.user?.role || "",
    action,
    module: module || "",
    targetType: targetType || "",
    targetId: targetId ? String(targetId) : "",
    metadata: sanitizeMetadata(metadata),
    ipAddress: req?.ip || req?.headers?.["x-forwarded-for"] || "",
    userAgent: req?.headers?.["user-agent"] || "",
  });
};
