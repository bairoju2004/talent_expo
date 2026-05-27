const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const { protect, adminOnly } = require("../middleware/authMiddleware");

const User = require("../models/User");
const ArtistProfile = require("../models/ArtistProfile");
const CustomerProfile = require("../models/CustomerProfile");
const Booking = require("../models/Booking");
const Post = require("../models/Post");
const Review = require("../models/Review");
const Message = require("../models/Message");

// All admin routes require auth + admin role
router.use(protect, adminOnly);

// ─────────────────────────────────────────────────────────────────────────────
// ANALYTICS — GET /api/admin/analytics
// Returns platform-wide counts + recent activity breakdown
// ─────────────────────────────────────────────────────────────────────────────
router.get("/analytics", async (req, res) => {
  try {
    const [
      totalUsers,
      totalArtists,
      totalCustomers,
      bannedUsers,
      totalBookings,
      pendingBookings,
      acceptedBookings,
      completedBookings,
      rejectedBookings,
      totalPosts,
      totalReviews,
      totalMessages,
    ] = await Promise.all([
      User.countDocuments({ role: { $ne: "admin" } }),
      User.countDocuments({ role: "artist" }),
      User.countDocuments({ role: "customer" }),
      User.countDocuments({ isBanned: true }),
      Booking.countDocuments(),
      Booking.countDocuments({ status: "pending" }),
      Booking.countDocuments({ status: "accepted" }),
      Booking.countDocuments({ status: "completed" }),
      Booking.countDocuments({ status: "rejected" }),
      Post.countDocuments(),
      Review.countDocuments(),
      Message.countDocuments(),
    ]);

    // Average rating across all reviews
    const ratingAgg = await Review.aggregate([
      { $group: { _id: null, avg: { $avg: "$rating" } } },
    ]);
    const avgRating = ratingAgg[0]?.avg
      ? Math.round(ratingAgg[0].avg * 10) / 10
      : null;

    // Bookings per month — last 6 months
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1);
    sixMonthsAgo.setHours(0, 0, 0, 0);

    const bookingsByMonth = await Booking.aggregate([
      { $match: { createdAt: { $gte: sixMonthsAgo } } },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]);

    // Registrations per month — last 6 months
    const registrationsByMonth = await User.aggregate([
      { $match: { createdAt: { $gte: sixMonthsAgo }, role: { $ne: "admin" } } },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]);

    // Top talent categories by booking count
    const topCategories = await Booking.aggregate([
      {
        $lookup: {
          from: "artistprofiles",
          localField: "artist",
          foreignField: "user",
          as: "artistProfile",
        },
      },
      { $unwind: { path: "$artistProfile", preserveNullAndEmpty: true } },
      {
        $group: {
          _id: "$artistProfile.talentCategory",
          count: { $sum: 1 },
        },
      },
      { $match: { _id: { $ne: null } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
    ]);

    res.json({
      users: { total: totalUsers, artists: totalArtists, customers: totalCustomers, banned: bannedUsers },
      bookings: { total: totalBookings, pending: pendingBookings, accepted: acceptedBookings, completed: completedBookings, rejected: rejectedBookings },
      content: { posts: totalPosts, reviews: totalReviews, messages: totalMessages },
      avgRating,
      bookingsByMonth,
      registrationsByMonth,
      topCategories,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// USERS — GET /api/admin/users
// List all non-admin users with profiles, paginated + searchable
// ─────────────────────────────────────────────────────────────────────────────
router.get("/users", async (req, res) => {
  try {
    const { search = "", role = "", page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const filter = { role: { $ne: "admin" } };
    if (role && role !== "all") filter.role = role;
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    const [users, total] = await Promise.all([
      User.find(filter).select("-password").sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      User.countDocuments(filter),
    ]);

    // Attach profile data (name, pic) for each user
    const userIds = users.map((u) => u._id);
    const [artistProfiles, customerProfiles] = await Promise.all([
      ArtistProfile.find({ user: { $in: userIds } }, "user fullName profilePicture talentCategory"),
      CustomerProfile.find({ user: { $in: userIds } }, "user fullName profilePicture"),
    ]);

    const artistMap = {};
    artistProfiles.forEach((p) => { artistMap[p.user.toString()] = p; });
    const customerMap = {};
    customerProfiles.forEach((p) => { customerMap[p.user.toString()] = p; });

    const enriched = users.map((u) => {
      const uid = u._id.toString();
      const profile = u.role === "artist" ? artistMap[uid] : customerMap[uid];
      return {
        ...u.toObject(),
        profilePicture: profile?.profilePicture || null,
        fullName: profile?.fullName || u.name,
        talentCategory: profile?.talentCategory || null,
      };
    });

    res.json({ users: enriched, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// BAN / UNBAN USER — PUT /api/admin/users/:userId/ban
// ─────────────────────────────────────────────────────────────────────────────
router.put("/users/:userId/ban", async (req, res) => {
  try {
    const { isBanned, banReason = "" } = req.body;
    const user = await User.findById(req.params.userId);

    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.role === "admin") return res.status(403).json({ message: "Cannot ban an admin" });

    user.isBanned = isBanned;
    user.banReason = isBanned ? banReason : "";
    await user.save();

    res.json({
      message: isBanned ? "User banned successfully" : "User unbanned successfully",
      isBanned: user.isBanned,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE USER — DELETE /api/admin/users/:userId
// Removes user + their profile, posts, bookings, reviews
// ─────────────────────────────────────────────────────────────────────────────
router.delete("/users/:userId", async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.role === "admin") return res.status(403).json({ message: "Cannot delete an admin" });

    await Promise.all([
      ArtistProfile.deleteOne({ user: user._id }),
      CustomerProfile.deleteOne({ user: user._id }),
      Post.deleteMany({ artist: user._id }),
      Review.deleteMany({ $or: [{ customer: user._id }, { artist: user._id }] }),
      Booking.deleteMany({ $or: [{ customer: user._id }, { artist: user._id }] }),
      User.deleteOne({ _id: user._id }),
    ]);

    res.json({ message: "User and all associated data deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// BOOKINGS — GET /api/admin/bookings
// All bookings with customer + artist info, paginated + filterable
// ─────────────────────────────────────────────────────────────────────────────
router.get("/bookings", async (req, res) => {
  try {
    const { status = "", page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const filter = {};
    if (status && status !== "all") filter.status = status;

    const [bookings, total] = await Promise.all([
      Booking.find(filter)
        .populate("customer", "name email")
        .populate("artist", "name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      Booking.countDocuments(filter),
    ]);

    res.json({ bookings, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE BOOKING STATUS (dispute resolution) — PUT /api/admin/bookings/:id
// ─────────────────────────────────────────────────────────────────────────────
router.put("/bookings/:id", async (req, res) => {
  try {
    const { status } = req.body;
    const VALID = ["pending", "accepted", "rejected", "completed"];
    if (!VALID.includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const booking = await Booking.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    ).populate("customer", "name email").populate("artist", "name email");

    if (!booking) return res.status(404).json({ message: "Booking not found" });

    res.json(booking);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POSTS — GET /api/admin/posts
// All posts with artist info, paginated
// ─────────────────────────────────────────────────────────────────────────────
router.get("/posts", async (req, res) => {
  try {
    const { page = 1, limit = 24 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const [posts, total] = await Promise.all([
      Post.find()
        .populate("artist", "name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      Post.countDocuments(),
    ]);

    res.json({ posts, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE POST — DELETE /api/admin/posts/:postId
// ─────────────────────────────────────────────────────────────────────────────
router.delete("/posts/:postId", async (req, res) => {
  try {
    const post = await Post.findByIdAndDelete(req.params.postId);
    if (!post) return res.status(404).json({ message: "Post not found" });
    res.json({ message: "Post removed" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// REVIEWS — GET /api/admin/reviews
// All reviews with customer + artist info, paginated
// ─────────────────────────────────────────────────────────────────────────────
router.get("/reviews", async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const [reviews, total] = await Promise.all([
      Review.find()
        .populate("customer", "name email")
        .populate("artist", "name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      Review.countDocuments(),
    ]);

    res.json({ reviews, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE REVIEW — DELETE /api/admin/reviews/:reviewId
// ─────────────────────────────────────────────────────────────────────────────
router.delete("/reviews/:reviewId", async (req, res) => {
  try {
    const review = await Review.findByIdAndDelete(req.params.reviewId);
    if (!review) return res.status(404).json({ message: "Review not found" });
    res.json({ message: "Review removed" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;