const mongoose = require("mongoose");

const customerProfileSchema = new mongoose.Schema(
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
    phoneNumber: {
      type: String,
    },
    location: {
      type: String,
    },
    bio: {
      type: String,
    },
    profilePicture: {
      type: String,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("CustomerProfile", customerProfileSchema);