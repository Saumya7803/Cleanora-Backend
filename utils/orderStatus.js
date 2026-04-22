export const ORDER_STATUSES = {
  PLACED: "placed",
  CONFIRMED: "confirmed",
  SHIPPED: "shipped",
  OUT_FOR_DELIVERY: "out_for_delivery",
  DELIVERED: "delivered",
  CANCELLED: "cancelled",
  RETURN_REQUESTED: "return_requested",
  RETURNED: "returned",
};

const statusTransitions = new Map([
  [ORDER_STATUSES.PLACED, new Set([ORDER_STATUSES.CONFIRMED, ORDER_STATUSES.CANCELLED])],
  [
    ORDER_STATUSES.CONFIRMED,
    new Set([ORDER_STATUSES.SHIPPED, ORDER_STATUSES.CANCELLED, ORDER_STATUSES.RETURN_REQUESTED]),
  ],
  [ORDER_STATUSES.SHIPPED, new Set([ORDER_STATUSES.OUT_FOR_DELIVERY])],
  [
    ORDER_STATUSES.OUT_FOR_DELIVERY,
    new Set([ORDER_STATUSES.DELIVERED, ORDER_STATUSES.RETURN_REQUESTED]),
  ],
  [ORDER_STATUSES.DELIVERED, new Set([ORDER_STATUSES.RETURN_REQUESTED])],
  [ORDER_STATUSES.RETURN_REQUESTED, new Set([ORDER_STATUSES.RETURNED])],
  [ORDER_STATUSES.RETURNED, new Set()],
  [ORDER_STATUSES.CANCELLED, new Set()],
]);

export const canTransitionOrderStatus = (currentStatus, nextStatus) => {
  const allowed = statusTransitions.get(currentStatus);
  if (!allowed) {
    return false;
  }

  return allowed.has(nextStatus);
};

export const toStatusLabel = (status) =>
  String(status || "")
    .split("_")
    .filter(Boolean)
    .map((segment) => segment[0]?.toUpperCase() + segment.slice(1))
    .join(" ");
