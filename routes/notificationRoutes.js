const express = require("express");
const router = express.Router();
const Notification = require("../models/Notification");
const { protect } = require("../middleware/authMiddleware");

// GET /api/notifications — get latest 30 for logged-in user
router.get("/", protect, async (req, res) => {
  try {
    const notifications = await Notification.find({ recipient: req.user._id })
      .sort({ createdAt: -1 })
      .limit(30);
    res.json(notifications);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/notifications/unread-count
router.get("/unread-count", protect, async (req, res) => {
  try {
    const count = await Notification.countDocuments({
      recipient: req.user._id,
      isRead: false,
    });
    res.json({ count });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/notifications/:id/read — mark one as read
router.put("/:id/read", protect, async (req, res) => {
  try {
    await Notification.findOneAndUpdate(
      { _id: req.params.id, recipient: req.user._id },
      { isRead: true }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/notifications/read-all — mark all as read
router.put("/read-all", protect, async (req, res) => {
  try {
    await Notification.updateMany(
      { recipient: req.user._id, isRead: false },
      { isRead: true }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/notifications/unread-booking-count — unread booking notifs by role
// Artists get count of 'new_booking', customers get count of 'booking_status'
router.get("/unread-booking-count", protect, async (req, res) => {
  try {
    const type = req.user.role === "artist" ? "new_booking" : "booking_status";
    const count = await Notification.countDocuments({
      recipient: req.user._id,
      type,
      isRead: false,
    });
    res.json({ count });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/notifications/read-booking — mark all booking notifs as read by role
router.put("/read-booking", protect, async (req, res) => {
  try {
    const type = req.user.role === "artist" ? "new_booking" : "booking_status";
    await Notification.updateMany(
      { recipient: req.user._id, type, isRead: false },
      { isRead: true }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/notifications/clear-all — delete all notifications for user
// MUST be defined BEFORE /:id route to take precedence
router.delete("/clear-all", protect, async (req, res) => {
  try {
    console.log('CLEAR ALL notifications route called by user:', req.user._id);
    const result = await Notification.deleteMany({ recipient: req.user._id });
    console.log('Clear all result:', result);
    res.json({ success: true });
  } catch (err) {
    console.error('Error clearing all notifications:', err);
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/notifications/:id — delete one notification
router.delete("/:id", protect, async (req, res) => {
  try {
    console.log('DELETE notification route called for ID:', req.params.id, 'by user:', req.user._id);
    const result = await Notification.findOneAndDelete({
      _id: req.params.id,
      recipient: req.user._id,
    });
    console.log('Delete result:', result);
    if (!result) {
      return res.status(404).json({ message: 'Notification not found' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting notification:', err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;