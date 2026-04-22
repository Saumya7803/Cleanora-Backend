import mongoose from "mongoose";

const bannerSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    subtitle: {
      type: String,
      default: "",
      trim: true,
    },
    imageUrl: {
      type: String,
      required: true,
      trim: true,
    },
    ctaLabel: {
      type: String,
      default: "",
      trim: true,
    },
    ctaLink: {
      type: String,
      default: "",
      trim: true,
    },
    priority: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    startAt: {
      type: Date,
      default: Date.now,
    },
    endAt: {
      type: Date,
      default: null,
    },
    tags: {
      type: [String],
      default: [],
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

bannerSchema.index({ isActive: 1, priority: -1, updatedAt: -1 });

const Banner = mongoose.model("Banner", bannerSchema);

export default Banner;
