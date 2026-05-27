const express = require("express");
const router = express.Router();
const Message = require("../models/Message");
const Booking = require("../models/Booking");
const { protect } = require("../middleware/authMiddleware");

// Get all messages for a booking
router.get("/:bookingId", protect, async (req, res) => {
  try {
    const messages = await Message.find({ bookingId: req.params.bookingId })
      .sort({ createdAt: 1 });
    res.json(messages);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Mark all messages in a booking as read
// Called when user opens the chat
router.put("/:bookingId/read", protect, async (req, res) => {
  try {
    await Message.updateMany(
      {
        bookingId: req.params.bookingId,
        sender: { $ne: req.user._id }, // Only mark OTHER person's messages as read
        isRead: false,
      },
      { isRead: true }
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get unread message count per booking
// Used to show notification badges
router.get("/:bookingId/unread", protect, async (req, res) => {
  try {
    const count = await Message.countDocuments({
      bookingId: req.params.bookingId,
      sender: { $ne: req.user._id },
      isRead: false,
    });
    res.json({ count });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// DELETE /api/messages/:bookingId/clear — clear all messages in a chat
router.delete("/:bookingId/clear", protect, async (req, res) => {
  try {
    // Verify user is part of this booking
    const booking = await Booking.findById(req.params.bookingId);
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    const isParticipant = booking.customer.toString() === req.user._id.toString() ||
                         booking.artist.toString() === req.user._id.toString();

    if (!isParticipant) {
      return res.status(403).json({ message: "Not authorized to clear this chat" });
    }

    // Delete all messages in this booking
    const result = await Message.deleteMany({ bookingId: req.params.bookingId });
    console.log(`Cleared ${result.deletedCount} messages from booking ${req.params.bookingId}`);

    res.json({ success: true, deletedCount: result.deletedCount });
  } catch (error) {
    console.error('Error clearing chat:', error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;