const mongoose = require("mongoose");

const postSchema = new mongoose.Schema(
  {
    artist: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    caption: {
      type: String,
      default: "",
    },
    // Array of uploaded files — supports carousel posts (up to 10)
    files: [
      {
        url: { type: String, required: true },
        fileType: { type: String, enum: ["image", "video"], required: true },
      },
    ],
    // Top-level fields kept for backwards-compat: reflect the first file
    fileUrl: {
      type: String,
      required: true,
    },
    fileType: {
      type: String,
      enum: ["image", "video"],
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Post", postSchema);