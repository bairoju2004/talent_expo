const mongoose = require("mongoose");

const artistProfileSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    fullName: {
      type: String,
      required: true,
    },
    talentCategory: {
      type: String,
      required: true,
    },
    experience: {
      type: Number,
      required: true,
    },
    description: {
      type: String,
    },
    profilePicture: {
      type: String,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ArtistProfile", artistProfileSchema);