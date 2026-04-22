import mongoose from "mongoose";

const inventoryRuleSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      unique: true,
    },
    threshold: {
      type: Number,
      required: true,
      default: 10,
      min: 0,
    },
    enabled: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

inventoryRuleSchema.index({ enabled: 1, threshold: 1 });

const InventoryRule = mongoose.model("InventoryRule", inventoryRuleSchema);

export default InventoryRule;
