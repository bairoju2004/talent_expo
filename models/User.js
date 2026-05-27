const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      enum: ["customer", "artist", "admin"],
      required: true,
    },

    name: {
      type: String,
      required: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
    },

    password: {
      type: String,
      required: false, // Not required for Google OAuth users
    },

    // ── Google OAuth ─────────────────────────────────────────────────────────
    googleId: {
      type: String,
      default: null,
    },

    authProvider: {
      type: String,
      enum: ["local", "google"],
      default: "local",
    },

    // ── Email Verification ───────────────────────────────────────────────────
    isEmailVerified: {
      type: Boolean,
      default: false,
    },

    emailVerificationToken: {
      type: String,
      default: null,
    },

    emailVerificationExpires: {
      type: Date,
      default: null,
    },

    // ── Password Reset ───────────────────────────────────────────────────────
    passwordResetToken: {
      type: String,
      default: null,
    },

    passwordResetExpires: {
      type: Date,
      default: null,
    },

    // ── Soft ban ─────────────────────────────────────────────────────────────
    isBanned: {
      type: Boolean,
      default: false,
    },

    banReason: {
      type: String,
      default: "",
    },

    // Artist Specific Fields
    talents: [{ type: String }],
    experience: { type: String },
    posts: [{ type: String }],
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
