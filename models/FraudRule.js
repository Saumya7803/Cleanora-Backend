import mongoose from "mongoose";

const fraudRuleSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: [
        "max_order_amount",
        "blocked_pincode",
        "high_frequency_orders",
        "coupon_abuse",
        "cod_risk",
      ],
      required: true,
    },
    enabled: {
      type: Boolean,
      default: true,
    },
    weight: {
      type: Number,
      default: 25,
      min: 1,
      max: 100,
    },
    action: {
      type: String,
      enum: ["flag", "hold", "block"],
      default: "flag",
    },
    config: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

fraudRuleSchema.index({ enabled: 1, type: 1 });

const FraudRule = mongoose.model("FraudRule", fraudRuleSchema);

export default FraudRule;
