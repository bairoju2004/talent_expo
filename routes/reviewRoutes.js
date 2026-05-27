const express = require("express");
const router = express.Router();
const Review = require("../models/Review");
const Booking = require("../models/Booking");
const CustomerProfile = require("../models/CustomerProfile");
const { protect } = require("../middleware/authMiddleware");
const redis = require("../config/redis");

// ── POST /api/reviews
// Customer submits a review for a completed booking (one per booking)
router.post("/", protect, async (req, res) => {
  try {
    const { bookingId, rating, comment } = req.body;

    if (req.user.role !== "customer") {
      return res.status(403).json({ message: "Only customers can leave reviews" });
    }

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ message: "Rating must be between 1 and 5" });
    }

    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }
    if (booking.customer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "You can only review your own bookings" });
    }
    if (booking.status !== "completed") {
      return res.status(400).json({ message: "You can only review completed bookings" });
    }

    const existing = await Review.findOne({ booking: bookingId });
    if (existing) {
      return res.status(400).json({ message: "You have already reviewed this booking" });
    }

    const review = await Review.create({
      booking: bookingId,
      customer: req.user._id,
      artist: booking.artist,
      rating,
      comment: comment || "",
    });

    const customerProfile = await CustomerProfile.findOne(
      { user: req.user._id },
      "fullName profilePicture"
    );

    // Bust review cache for this artist
    try {
      await redis.del(`reviews:artist:${booking.artist}`);
    } catch (cacheErr) {
      console.error("Redis cache bust failed (reviews POST):", cacheErr.message);
    }

    res.status(201).json({
      ...review.toObject(),
      customerName: customerProfile?.fullName || req.user.name,
      customerPic: customerProfile?.profilePicture || null,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ── GET /api/reviews/artist/:artistId
// Cached for 10 minutes in Redis
router.get("/artist/:artistId", async (req, res) => {
  const cacheKey = `reviews:artist:${req.params.artistId}`;

  // Try cache first — fall through silently if Redis is down
  try {
    const cached = await redis.get(cacheKey);
    if (cached) return res.json(JSON.parse(cached));
  } catch (cacheErr) {
    console.error("Redis get failed (reviews GET):", cacheErr.message);
  }

  try {
    const reviews = await Review.find({ artist: req.params.artistId })
      .sort({ createdAt: -1 })
      .populate("customer", "name")
      .lean();

    const customerIds = reviews.map((r) => r.customer?._id).filter(Boolean);
    const customerProfiles = await CustomerProfile.find(
      { user: { $in: customerIds } },
      "user fullName profilePicture"
    );
    const picMap = {};
    customerProfiles.forEach((p) => {
      picMap[p.user.toString()] = {
        fullName: p.fullName,
        profilePicture: p.profilePicture || null,
      };
    });

    const enriched = reviews.map((r) => {
      const cp = picMap[r.customer?._id?.toString()] || {};
      return {
        ...r,
        customerName: cp.fullName || r.customer?.name || "Customer",
        customerPic: cp.profilePicture || null,
      };
    });

    const total = enriched.length;
    const avgRating =
      total > 0
        ? Math.round((enriched.reduce((s, r) => s + r.rating, 0) / total) * 10) / 10
        : null;

    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    enriched.forEach((r) => {
      distribution[r.rating] = (distribution[r.rating] || 0) + 1;
    });

    const result = { reviews: enriched, total, avgRating, distribution };

    // Store in Redis for 10 minutes
    try {
      await redis.setEx(cacheKey, 600, JSON.stringify(result));
    } catch (cacheErr) {
      console.error("Redis set failed (reviews GET):", cacheErr.message);
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ── GET /api/reviews/check/:bookingId
router.get("/check/:bookingId", protect, async (req, res) => {
  try {
    const review = await Review.findOne({
      booking: req.params.bookingId,
      customer: req.user._id,
    });
    res.json({ reviewed: !!review, review: review || null });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;