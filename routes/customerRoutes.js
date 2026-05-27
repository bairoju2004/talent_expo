const express = require("express");
const router = express.Router();
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const CustomerProfile = require("../models/CustomerProfile");
const {
  createCustomerProfile,
  getCustomerProfile,
  updateCustomerProfile,
} = require("../controllers/customerController");
const { protect } = require("../middleware/authMiddleware");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "talentexpo/profiles",
    resource_type: "image",
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
  },
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("Only image files are allowed"), false);
  }
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } });

router.post("/profile", protect, createCustomerProfile);
router.get("/profile", protect, getCustomerProfile);
router.put("/profile", protect, updateCustomerProfile);

router.put("/profile/picture", protect, upload.single("profilePicture"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "Please upload an image file" });
    const profile = await CustomerProfile.findOneAndUpdate(
      { user: req.user._id },
      { profilePicture: req.file.path },
      { new: true }
    ).populate("user", "name email");
    if (!profile) return res.status(404).json({ message: "Profile not found" });
    res.json({ profilePicture: profile.profilePicture });
  } catch (error) {
    res.status(500).json({ message: "Server Error" });
  }
});

router.delete("/profile/picture", protect, async (req, res) => {
  try {
    const profile = await CustomerProfile.findOneAndUpdate(
      { user: req.user._id },
      { $unset: { profilePicture: "" } },
      { new: true }
    ).populate("user", "name email");
    if (!profile) return res.status(404).json({ message: "Profile not found" });
    res.json({ message: "Profile picture removed" });
  } catch (error) {
    res.status(500).json({ message: "Server Error" });
  }
});

module.exports = router;