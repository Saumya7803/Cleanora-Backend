import mongoose from "mongoose";

const pincodeRuleSchema = new mongoose.Schema(
  {
    pincode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 6,
      maxlength: 6,
    },
    city: {
      type: String,
      required: true,
      trim: true,
    },
    state: {
      type: String,
      required: true,
      trim: true,
    },
    area: {
      type: String,
      default: "",
      trim: true,
    },
    isServiceable: {
      type: Boolean,
      default: true,
    },
    codAvailable: {
      type: Boolean,
      default: true,
    },
    shippingFee: {
      type: Number,
      default: 0,
      min: 0,
    },
    estimatedDeliveryDays: {
      type: Number,
      default: 3,
      min: 1,
      max: 30,
    },
    minOrderAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    notes: {
      type: String,
      default: "",
      trim: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

pincodeRuleSchema.index({ city: 1, state: 1 });

const PincodeRule = mongoose.model("PincodeRule", pincodeRuleSchema);

export default PincodeRule;
