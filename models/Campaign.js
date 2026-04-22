import mongoose from "mongoose";

const campaignSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    code: {
      type: String,
      default: "",
      trim: true,
      uppercase: true,
      unique: true,
      sparse: true,
    },
    channel: {
      type: String,
      enum: ["coupon", "banner", "push", "custom"],
      default: "custom",
    },
    description: {
      type: String,
      default: "",
      trim: true,
    },
    status: {
      type: String,
      enum: ["draft", "scheduled", "live", "paused", "completed", "cancelled"],
      default: "draft",
    },
    startAt: {
      type: Date,
      default: null,
    },
    endAt: {
      type: Date,
      default: null,
    },
    target: {
      cities: {
        type: [String],
        default: [],
      },
      states: {
        type: [String],
        default: [],
      },
      pincodes: {
        type: [String],
        default: [],
      },
      segments: {
        type: [String],
        default: [],
      },
    },
    budget: {
      type: Number,
      default: 0,
      min: 0,
    },
    spend: {
      type: Number,
      default: 0,
      min: 0,
    },
    metrics: {
      impressions: {
        type: Number,
        default: 0,
        min: 0,
      },
      clicks: {
        type: Number,
        default: 0,
        min: 0,
      },
      orders: {
        type: Number,
        default: 0,
        min: 0,
      },
      revenue: {
        type: Number,
        default: 0,
        min: 0,
      },
    },
    assetRefs: {
      bannerIds: {
        type: [mongoose.Schema.Types.ObjectId],
        ref: "Banner",
        default: [],
      },
      couponCodes: {
        type: [String],
        default: [],
      },
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

campaignSchema.index({ status: 1, startAt: 1, endAt: 1 });
campaignSchema.index({ updatedAt: -1 });

const Campaign = mongoose.model("Campaign", campaignSchema);

export default Campaign;
