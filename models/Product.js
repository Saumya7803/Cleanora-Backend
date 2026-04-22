import mongoose from "mongoose";

const productImageSchema = new mongoose.Schema(
  {
    url: {
      type: String,
      required: true,
      trim: true,
    },
    publicId: {
      type: String,
      default: "",
      trim: true,
    },
  },
  { _id: false },
);

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Product name is required"],
      trim: true,
    },
    description: {
      type: String,
      required: [true, "Product description is required"],
      trim: true,
    },
    price: {
      type: Number,
      required: [true, "Product price is required"],
      min: [0, "Price cannot be negative"],
    },
    category: {
      type: String,
      required: [true, "Category is required"],
      trim: true,
    },
    stock: {
      type: Number,
      default: 0,
      min: [0, "Stock cannot be negative"],
    },
    imageUrl: {
      type: String,
      default: "",
      trim: true,
    },
    images: {
      type: [productImageSchema],
      default: [],
    },
    cloudinaryPublicId: {
      type: String,
      default: "",
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    ratingAverage: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    ratingCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true },
);

productSchema.index({ category: 1, isActive: 1 });
productSchema.index({ price: 1 });
productSchema.index({ name: "text", description: "text", category: "text" });
productSchema.index({ isActive: 1, createdAt: -1 });
productSchema.index({ isActive: 1, ratingCount: -1, ratingAverage: -1 });
productSchema.index({ isActive: 1, stock: 1 });

productSchema.pre("save", function normalizeImages(next) {
  if (Array.isArray(this.images) && this.images.length > 0) {
    this.imageUrl = this.images[0].url;
  } else if (this.imageUrl) {
    this.images = [
      {
        url: this.imageUrl,
        publicId: this.cloudinaryPublicId || "",
      },
    ];
  }

  next();
});

const Product = mongoose.model("Product", productSchema);

export default Product;
