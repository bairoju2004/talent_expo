const Notification = require("../models/Notification");

/**
 * Create a notification and emit it via Socket.io in real-time.
 */
async function createNotification(io, { recipientId, type, title, body, bookingId }) {
  try {
    const notification = await Notification.create({
      recipient: recipientId,
      type,
      title,
      body,
      bookingId: bookingId || undefined,
    });

    // Push to the recipient's personal socket room
    io.to(`user:${recipientId}`).emit("notification", {
      _id: notification._id,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      bookingId: notification.bookingId,
      isRead: notification.isRead,
      createdAt: notification.createdAt,
    });
  } catch (err) {
    console.error("createNotification error:", err.message);
  }
}

module.exports = createNotification;