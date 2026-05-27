const express = require("express");
const router = express.Router();
const { createBooking, updateBookingStatus, getMyBookings, getBookingById } = require("../controllers/bookingController");
const { protect } = require("../middleware/authMiddleware");

router.post("/", protect, createBooking);
router.put("/:id", protect, updateBookingStatus);
router.get("/my-bookings", protect, getMyBookings);
router.get("/:id", protect, getBookingById);

module.exports = router;