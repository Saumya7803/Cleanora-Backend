import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import {
  getDefaultAdminRole,
  isElevatedRole,
  normalizeAdminRole,
  sanitizePermissions,
} from "../config/adminPermissions.js";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: 6,
      select: false,
    },
    role: {
      type: String,
      enum: ["customer", "admin", "super_admin"],
      default: "customer",
    },
    adminRole: {
      type: String,
      default: null,
      trim: true,
      lowercase: true,
    },
    permissions: {
      type: [String],
      default: [],
    },
    isBlocked: {
      type: Boolean,
      default: false,
    },
    phone: {
      type: String,
      default: "",
      trim: true,
    },
    avatarUrl: {
      type: String,
      default: "",
      trim: true,
    },
  },
  { timestamps: true },
);

userSchema.pre("save", async function hashPassword(next) {
  if (!this.isModified("password")) {
    next();
    return;
  }

  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.pre("save", function normalizeAdminAccess(next) {
  if (!isElevatedRole(this.role)) {
    this.adminRole = null;
    this.permissions = [];
    this.isBlocked = false;
    next();
    return;
  }

  this.adminRole = normalizeAdminRole({
    role: this.role,
    adminRole: this.adminRole || getDefaultAdminRole(this.role),
  });
  this.permissions = sanitizePermissions(this.permissions);

  next();
});

userSchema.methods.comparePassword = async function comparePassword(password) {
  return bcrypt.compare(password, this.password);
};

const User = mongoose.model("User", userSchema);

export default User;
