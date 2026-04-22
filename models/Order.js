import mongoose from "mongoose";

const orderItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    imageUrl: {
      type: String,
      default: "",
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    category: {
      type: String,
      default: "",
      trim: true,
    },
  },
  { _id: false },
);

const orderStatusTimelineSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      required: true,
      enum: [
        "placed",
        "confirmed",
        "shipped",
        "out_for_delivery",
        "delivered",
        "cancelled",
        "return_requested",
        "returned",
      ],
    },
    note: {
      type: String,
      default: "",
      trim: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false },
);

const addressSchema = new mongoose.Schema(
  {
    fullName: { type: String, default: "", trim: true },
    phone: { type: String, default: "", trim: true },
    line1: { type: String, default: "", trim: true },
    line2: { type: String, default: "", trim: true },
    landmark: { type: String, default: "", trim: true },
    city: { type: String, default: "", trim: true },
    state: { type: String, default: "", trim: true },
    postalCode: { type: String, default: "", trim: true },
    country: { type: String, default: "India", trim: true },
  },
  { _id: false },
);

const orderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    items: {
      type: [orderItemSchema],
      required: true,
      validate: {
        validator: (items) => Array.isArray(items) && items.length > 0,
        message: "Order must include at least one item",
      },
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    subtotalAmount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    shippingFee: {
      type: Number,
      default: 0,
      min: 0,
    },
    discountAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    couponCode: {
      type: String,
      default: "",
      trim: true,
      uppercase: true,
    },
    status: {
      type: String,
      enum: [
        "placed",
        "confirmed",
        "shipped",
        "out_for_delivery",
        "delivered",
        "cancelled",
        "return_requested",
        "returned",
      ],
      default: "placed",
    },
    statusTimeline: {
      type: [orderStatusTimelineSchema],
      default: [{ status: "placed", note: "Order placed" }],
    },
    payment: {
      method: {
        type: String,
        enum: ["upi", "cash_on_delivery"],
        default: "cash_on_delivery",
      },
      status: {
        type: String,
        enum: ["pending", "success", "failed", "cod_pending", "cod_collected", "refunded"],
        default: "cod_pending",
      },
      transactionId: {
        type: String,
        default: "",
        trim: true,
      },
      upiApp: {
        type: String,
        default: "",
        trim: true,
      },
      failureReason: {
        type: String,
        default: "",
        trim: true,
      },
      paidAt: Date,
    },
    paymentMethod: {
      type: String,
      default: "cash_on_delivery",
      trim: true,
    },
    deliverySlot: {
      type: String,
      default: "",
      trim: true,
    },
    address: {
      type: addressSchema,
      default: {},
    },
    cancelReason: {
      type: String,
      default: "",
      trim: true,
    },
    cancelledAt: Date,
    returnRequest: {
      requested: {
        type: Boolean,
        default: false,
      },
      reason: {
        type: String,
        default: "",
        trim: true,
      },
      requestedAt: Date,
      status: {
        type: String,
        enum: ["none", "requested", "approved", "rejected"],
        default: "none",
      },
      refundStatus: {
        type: String,
        enum: ["not_initiated", "processing", "completed", "failed"],
        default: "not_initiated",
      },
      refundedAt: Date,
      refundUpdatedAt: Date,
      refundTransactionId: {
        type: String,
        default: "",
        trim: true,
      },
      resolutionNote: {
        type: String,
        default: "",
        trim: true,
      },
    },
  },
  { timestamps: true },
);

orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });

orderSchema.pre("save", function syncLegacyPaymentMethod(next) {
  if (this.payment?.method) {
    this.paymentMethod = this.payment.method;
  }

  next();
});

const Order = mongoose.model("Order", orderSchema);

export default Order;
