import mongoose from "mongoose";

const addressSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    fullName: {
      type: String,
      required: [true, "fullName is required"],
      trim: true,
    },
    phone: {
      type: String,
      required: [true, "phone is required"],
      trim: true,
    },
    line1: {
      type: String,
      required: [true, "line1 is required"],
      trim: true,
    },
    line2: {
      type: String,
      default: "",
      trim: true,
    },
    landmark: {
      type: String,
      default: "",
      trim: true,
    },
    city: {
      type: String,
      required: [true, "city is required"],
      trim: true,
    },
    state: {
      type: String,
      required: [true, "state is required"],
      trim: true,
    },
    postalCode: {
      type: String,
      required: [true, "postalCode is required"],
      trim: true,
    },
    country: {
      type: String,
      default: "India",
      trim: true,
    },
    label: {
      type: String,
      default: "Home",
      trim: true,
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

addressSchema.index({ user: 1, isDefault: -1, createdAt: -1 });

const Address = mongoose.model("Address", addressSchema);

export default Address;
