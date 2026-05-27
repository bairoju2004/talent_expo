const express = require("express");
const router = express.Router();
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const ArtistProfile = require("../models/ArtistProfile");
const redis = require("../config/redis");
const {
  createArtistProfile,
  getArtistProfile,
  updateArtistProfile,
  getArtistsByTalent,
} = require("../controllers/artistController");
const { protect } = require("../middleware/authMiddleware");

// ── Cloudinary config ────────────────────────────────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ── Cloudinary storage for profile pictures ──────────────────────────
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

// ── Routes ───────────────────────────────────────────────────────────
router.post("/profile", protect, createArtistProfile);
router.get("/profile", protect, getArtistProfile);
router.put("/profile", protect, updateArtistProfile);
router.get("/", getArtistsByTalent);

// Upload / update profile picture
router.put("/profile/picture", protect, upload.single("profilePicture"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Please upload an image file" });
    }

    // Cloudinary returns the full URL in req.file.path
    const profile = await ArtistProfile.findOneAndUpdate(
      { user: req.user._id },
      { profilePicture: req.file.path },
      { new: true }
    ).populate("user", "name email");

    if (!profile) {
      return res.status(404).json({ message: "Profile not found" });
    }

    // Bust the talent category cache so search results show the new picture
    if (profile.talentCategory) {
      await redis.del(`artists:talent:${profile.talentCategory}`);
    }

    res.json({ profilePicture: profile.profilePicture });
  } catch (error) {
    res.status(500).json({ message: "Server Error" });
  }
});

// Delete profile picture
router.delete("/profile/picture", protect, async (req, res) => {
  try {
    const profile = await ArtistProfile.findOneAndUpdate(
      { user: req.user._id },
      { $unset: { profilePicture: "" } },
      { new: true }
    ).populate("user", "name email");
    if (!profile) return res.status(404).json({ message: "Profile not found" });

    // Bust the talent category cache so search results reflect the removal
    if (profile.talentCategory) {
      await redis.del(`artists:talent:${profile.talentCategory}`);
    }

    res.json({ message: "Profile picture removed" });
  } catch (error) {
    res.status(500).json({ message: "Server Error" });
  }
});

// Get artist profile by userId (public) — must be LAST
router.get("/public/:userId", async (req, res) => {
  try {
    const profile = await ArtistProfile.findOne({ user: req.params.userId })
      .populate("user", "name email");
    if (!profile) {
      return res.status(404).json({ message: "Profile not found" });
    }
    res.json(profile);
  } catch (error) {
    res.status(500).json({ message: "Server Error" });
  }
});

module.exports = router;