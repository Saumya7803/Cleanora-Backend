import mongoose from "mongoose";

const inventoryAlertSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    rule: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "InventoryRule",
      default: null,
    },
    currentStock: {
      type: Number,
      required: true,
      min: 0,
    },
    threshold: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ["active", "resolved", "ignored"],
      default: "active",
    },
    note: {
      type: String,
      default: "",
      trim: true,
    },
    triggeredAt: {
      type: Date,
      default: Date.now,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

inventoryAlertSchema.index({ status: 1, triggeredAt: -1 });
inventoryAlertSchema.index({ product: 1, status: 1 });

const InventoryAlert = mongoose.model("InventoryAlert", inventoryAlertSchema);

export default InventoryAlert;
