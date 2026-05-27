const express = require("express");
const router = express.Router();
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const Post = require("../models/Post");
const { protect } = require("../middleware/authMiddleware");
const redis = require("../config/redis");

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Configure Cloudinary Storage
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    return {
      folder: "talentexpo/posts",
      resource_type: file.mimetype.startsWith("video/") ? "video" : "image",
      allowed_formats: ["jpg", "jpeg", "png", "gif", "mp4", "mov", "avi"],
    };
  },
});

const fileFilter = (req, file, cb) => {
  if (
    file.mimetype.startsWith("image/") ||
    file.mimetype.startsWith("video/")
  ) {
    cb(null, true);
  } else {
    cb(new Error("Only images and videos allowed"), false);
  }
};

const upload = multer({ storage, fileFilter });

// Upload a post with 1–10 files (artist only)
router.post("/", protect, upload.array("files", 10), async (req, res) => {
  try {
    if (req.user.role !== "artist") {
      return res.status(403).json({ message: "Only artists can post" });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: "Please upload at least one file" });
    }

    // Cloudinary returns full URL in f.path
    const files = req.files.map((f) => ({
      url: f.path,
      fileType: f.mimetype.startsWith("image/") ? "image" : "video",
    }));

    const post = await Post.create({
      artist: req.user._id,
      caption: req.body.caption || "",
      files,
      fileUrl: files[0].url,
      fileType: files[0].fileType,
    });

    // Bust Redis cache for this artist
    await redis.del(`posts:artist:${req.user._id}`);

    res.status(201).json(post);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get all posts by a specific artist (public)
router.get("/:artistId", async (req, res) => {
  try {
    const cacheKey = `posts:artist:${req.params.artistId}`;

    const cached = await redis.get(cacheKey);
    if (cached) return res.json(JSON.parse(cached));

    const posts = await Post.find({ artist: req.params.artistId })
      .sort({ createdAt: -1 });

    await redis.setEx(cacheKey, 300, JSON.stringify(posts));
    res.json(posts);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete a post (artist only)
router.delete("/:postId", protect, async (req, res) => {
  try {
    const post = await Post.findById(req.params.postId);

    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    if (post.artist.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized" });
    }

    // Delete each file from Cloudinary
    for (const file of post.files) {
      try {
        // Extract public_id from Cloudinary URL
        const urlParts = file.url.split("/");
        const fileName = urlParts[urlParts.length - 1].split(".")[0];
        const publicId = `talentexpo/posts/${fileName}`;
        await cloudinary.uploader.destroy(publicId, {
          resource_type: file.fileType === "video" ? "video" : "image",
        });
      } catch (e) {
        // Continue even if Cloudinary delete fails
        console.log("Cloudinary delete error:", e.message);
      }
    }

    await Post.findByIdAndDelete(req.params.postId);

    // Bust Redis cache
    await redis.del(`posts:artist:${post.artist}`);

    res.json({ message: "Post deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;