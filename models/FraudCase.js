import mongoose from "mongoose";

const fraudCaseRuleMatchSchema = new mongoose.Schema(
  {
    rule: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FraudRule",
      default: null,
    },
    name: {
      type: String,
      default: "",
      trim: true,
    },
    type: {
      type: String,
      default: "",
      trim: true,
    },
    score: {
      type: Number,
      default: 0,
      min: 0,
    },
    reason: {
      type: String,
      default: "",
      trim: true,
    },
    action: {
      type: String,
      default: "flag",
      trim: true,
    },
  },
  { _id: false },
);

const fraudCaseSchema = new mongoose.Schema(
  {
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      unique: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    riskScore: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    severity: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      default: "low",
    },
    status: {
      type: String,
      enum: ["open", "investigating", "approved", "blocked", "resolved"],
      default: "open",
    },
    matchedRules: {
      type: [fraudCaseRuleMatchSchema],
      default: [],
    },
    notes: {
      type: String,
      default: "",
      trim: true,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

fraudCaseSchema.index({ status: 1, riskScore: -1, updatedAt: -1 });

const FraudCase = mongoose.model("FraudCase", fraudCaseSchema);

export default FraudCase;
