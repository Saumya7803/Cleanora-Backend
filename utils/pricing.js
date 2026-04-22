const DEFAULT_SHIPPING_FEE = 49;
const FREE_SHIPPING_THRESHOLD = 499;

export const normalizeCouponCode = (code) =>
  typeof code === "string" ? code.trim().toUpperCase() : "";

export const calculateShippingFee = (subtotal) =>
  subtotal >= FREE_SHIPPING_THRESHOLD || subtotal <= 0 ? 0 : DEFAULT_SHIPPING_FEE;

export const calculateCouponDiscount = ({ subtotal, coupon }) => {
  if (!coupon) {
    return 0;
  }

  if (subtotal < Number(coupon.minOrderAmount || 0)) {
    return 0;
  }

  const discountType = coupon.discountType;
  const discountValue = Number(coupon.discountValue || 0);

  if (discountType === "flat") {
    return Math.min(subtotal, discountValue);
  }

  const percentDiscount = (subtotal * discountValue) / 100;
  const maxDiscount =
    typeof coupon.maxDiscountAmount === "number" && Number.isFinite(coupon.maxDiscountAmount)
      ? coupon.maxDiscountAmount
      : null;

  if (maxDiscount === null) {
    return Math.min(subtotal, percentDiscount);
  }

  return Math.min(subtotal, Math.min(percentDiscount, maxDiscount));
};

export const calculateTotals = ({ subtotal, discountAmount = 0 }) => {
  const normalizedSubtotal = Math.max(0, Number(subtotal) || 0);
  const normalizedDiscount = Math.max(0, Math.min(normalizedSubtotal, Number(discountAmount) || 0));
  const shippingFee = calculateShippingFee(normalizedSubtotal - normalizedDiscount);
  const totalAmount = Math.max(0, normalizedSubtotal - normalizedDiscount + shippingFee);

  return {
    subtotalAmount: Number(normalizedSubtotal.toFixed(2)),
    discountAmount: Number(normalizedDiscount.toFixed(2)),
    shippingFee: Number(shippingFee.toFixed(2)),
    totalAmount: Number(totalAmount.toFixed(2)),
  };
};
