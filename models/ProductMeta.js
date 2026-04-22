import mongoose from "mongoose";

const productVariantSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      trim: true,
    },
    size: {
      type: String,
      required: true,
      trim: true,
    },
    price: {
      type: Number,
      default: 0,
      min: 0,
    },
    stock: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { _id: false },
);

const productMetaSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      unique: true,
      index: true,
    },
    sku: {
      type: String,
      default: "",
      trim: true,
    },
    status: {
      type: String,
      enum: ["active", "draft", "hidden"],
      default: "active",
    },
    mrp: {
      type: Number,
      default: 0,
      min: 0,
    },
    discountedPrice: {
      type: Number,
      default: 0,
      min: 0,
    },
    tags: {
      type: [String],
      default: [],
    },
    featured: {
      type: Boolean,
      default: false,
    },
    variants: {
      type: [productVariantSchema],
      default: [],
    },
    imageUrls: {
      type: [String],
      default: [],
    },
    views: {
      type: Number,
      default: 0,
      min: 0,
    },
    analyticsOrders: {
      type: Number,
      default: 0,
      min: 0,
    },
    analyticsRevenue: {
      type: Number,
      default: 0,
      min: 0,
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

productMetaSchema.index({ featured: 1, updatedAt: -1 });
productMetaSchema.index({ status: 1, updatedAt: -1 });

const ProductMeta = mongoose.model("ProductMeta", productMetaSchema);

export default ProductMeta;
