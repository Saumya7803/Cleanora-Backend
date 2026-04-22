import { normalizeSystemRole } from "../config/adminPermissions.js";
import asyncHandler from "../middleware/asyncHandler.js";
import { ApiError } from "../middleware/errorMiddleware.js";
import SupportTicket from "../models/SupportTicket.js";
import { createAuditLog } from "../utils/auditLog.js";
import { ensureObjectId, toSafeString } from "../utils/adminUtils.js";
import { buildPaginationMeta, getPagination } from "../utils/pagination.js";

export const createSupportTicket = asyncHandler(async (req, res) => {
  const subject = toSafeString(req.body.subject);
  const message = toSafeString(req.body.message);

  if (!subject || !message) {
    throw new ApiError("subject and message are required", 400);
  }

  const ticket = await SupportTicket.create({
    customer: req.user._id,
    name: req.user.name,
    email: req.user.email,
    phone: req.user.phone || "",
    subject,
    category: toSafeString(req.body.category || "general") || "general",
    message,
    priority: ["low", "medium", "high", "urgent"].includes(toSafeString(req.body.priority))
      ? toSafeString(req.body.priority)
      : "medium",
    meta: {
      orderId: toSafeString(req.body.orderId),
      source: toSafeString(req.body.source || "app") || "app",
    },
  });

  res.status(201).json({
    success: true,
    message: "Support ticket created",
    data: ticket,
  });
});

export const listMySupportTickets = asyncHandler(async (req, res) => {
  const tickets = await SupportTicket.find({ customer: req.user._id })
    .sort({ createdAt: -1 })
    .lean();

  res.status(200).json({
    success: true,
    data: tickets,
  });
});

export const listSupportTickets = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const query = {};

  if (req.query.status) {
    query.status = toSafeString(req.query.status);
  }

  if (req.query.priority) {
    query.priority = toSafeString(req.query.priority);
  }

  if (req.query.assignedTo) {
    ensureObjectId(req.query.assignedTo, "assignedTo user id");
    query.assignedTo = req.query.assignedTo;
  }

  if (req.query.search) {
    const search = toSafeString(req.query.search);
    query.$or = [
      { subject: { $regex: search, $options: "i" } },
      { message: { $regex: search, $options: "i" } },
      { name: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
    ];
  }

  const [tickets, total] = await Promise.all([
    SupportTicket.find(query)
      .populate("customer", "name email phone")
      .populate("assignedTo", "name email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    SupportTicket.countDocuments(query),
  ]);

  res.status(200).json({
    success: true,
    data: tickets,
    pagination: buildPaginationMeta({ page, limit, total }),
  });
});

export const updateSupportTicket = asyncHandler(async (req, res) => {
  ensureObjectId(req.params.id, "support ticket id");

  const ticket = await SupportTicket.findById(req.params.id);
  if (!ticket) {
    throw new ApiError("Support ticket not found", 404);
  }

  if (req.body.status) {
    const status = toSafeString(req.body.status);
    if (!["open", "in_progress", "resolved", "closed"].includes(status)) {
      throw new ApiError("Invalid status", 400);
    }
    ticket.status = status;
  }

  if (req.body.priority) {
    const priority = toSafeString(req.body.priority);
    if (!["low", "medium", "high", "urgent"].includes(priority)) {
      throw new ApiError("Invalid priority", 400);
    }
    ticket.priority = priority;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "assignedTo")) {
    const assignedTo = toSafeString(req.body.assignedTo);
    if (!assignedTo) {
      ticket.assignedTo = null;
    } else {
      ensureObjectId(assignedTo, "assignedTo user id");
      ticket.assignedTo = assignedTo;
    }
  }

  await ticket.save();

  await createAuditLog({
    req,
    action: "support_ticket_updated",
    module: "support",
    targetType: "SupportTicket",
    targetId: ticket._id,
    metadata: {
      status: ticket.status,
      priority: ticket.priority,
      assignedTo: ticket.assignedTo,
    },
  });

  res.status(200).json({
    success: true,
    message: "Support ticket updated",
    data: ticket,
  });
});

export const addSupportTicketReply = asyncHandler(async (req, res) => {
  ensureObjectId(req.params.id, "support ticket id");

  const message = toSafeString(req.body.message);
  if (!message) {
    throw new ApiError("message is required", 400);
  }

  const ticket = await SupportTicket.findById(req.params.id);
  if (!ticket) {
    throw new ApiError("Support ticket not found", 404);
  }

  ticket.replies.push({
    by: req.user._id,
    byRole: normalizeSystemRole(req.user.role),
    message,
    createdAt: new Date(),
  });

  if (ticket.status === "open") {
    ticket.status = "in_progress";
  }

  await ticket.save();

  await createAuditLog({
    req,
    action: "support_ticket_replied",
    module: "support",
    targetType: "SupportTicket",
    targetId: ticket._id,
    metadata: {
      replyLength: message.length,
      status: ticket.status,
    },
  });

  res.status(200).json({
    success: true,
    message: "Reply added",
    data: ticket,
  });
});
