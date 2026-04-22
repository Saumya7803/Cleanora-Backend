import mongoose from "mongoose";

const wishlistItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    addedAt: {
      type: Date,
      default: Date.now,
    },
    priceAtAdded: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastKnownPrice: {
      type: Number,
      default: 0,
      min: 0,
    },
    wasOutOfStock: {
      type: Boolean,
      default: false,
    },
    lastPriceDropAlertAt: {
      type: Date,
      default: null,
    },
    lastBackInStockAlertAt: {
      type: Date,
      default: null,
    },
  },
  { _id: false },
);

const wishlistSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    items: {
      type: [wishlistItemSchema],
      default: [],
    },
  },
  { timestamps: true },
);

const Wishlist = mongoose.model("Wishlist", wishlistSchema);

export default Wishlist;
