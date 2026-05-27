const Booking = require("../models/Booking");
const createNotification = require("../utils/createNotification");

// Create Booking (Customer Only)
exports.createBooking = async (req, res) => {
  try {
    const { artistId, eventDate, eventLocation, message } = req.body;

    if (req.user._id.toString() === artistId) {
      return res.status(400).json({ message: "You cannot book yourself." });
    }

    const booking = await Booking.create({
      customer: req.user._id,
      artist: artistId,
      eventDate,
      eventLocation,
      message,
    });

    // Notify the artist about the new booking
    const io = req.app.get("io");
    await createNotification(io, {
      recipientId: artistId,
      type: "new_booking",
      title: "New Booking Request",
      body: `${req.user.name} wants to book you for an event on ${new Date(eventDate).toLocaleDateString()}.`,
      bookingId: booking._id,
    });

    res.status(201).json(booking);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Artist Accept / Reject Booking
exports.updateBookingStatus = async (req, res) => {
  try {
    if (req.user.role !== "artist") {
      return res.status(403).json({ message: "Only artists can update booking status" });
    }

    const { status } = req.body;
    const VALID_STATUSES = ["pending", "accepted", "rejected", "completed"];
    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ message: "Invalid status value" });
    }

    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ message: "Booking not found" });

    if (booking.artist.toString() !== req.user._id.toString()) {
      return res.status(401).json({ message: "Not authorized to update this booking" });
    }

    const allowedTransitions = {
      pending:   ["accepted", "rejected"],
      accepted:  ["completed"],
      rejected:  [],
      completed: [],
    };

    if (!allowedTransitions[booking.status].includes(status)) {
      return res.status(400).json({
        message: `Cannot transition booking from '${booking.status}' to '${status}'`,
      });
    }

    booking.status = status;
    await booking.save();

    // Notify the customer of the status change
    const statusLabels = {
      accepted:  "accepted ✅",
      rejected:  "rejected ❌",
      completed: "marked as completed 🎉",
    };
    const io = req.app.get("io");
    await createNotification(io, {
      recipientId: booking.customer.toString(),
      type: "booking_status",
      title: "Booking Update",
      body: `${req.user.name} has ${statusLabels[status] || status} your booking.`,
      bookingId: booking._id,
    });

    res.status(200).json(booking);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get Single Booking by ID (with profile pictures)
exports.getBookingById = async (req, res) => {
  try {
    const ArtistProfile = require("../models/ArtistProfile");
    const CustomerProfile = require("../models/CustomerProfile");

    const booking = await Booking.findById(req.params.id)
      .populate("artist", "name email")
      .populate("customer", "name email")
      .lean();

    if (!booking) return res.status(404).json({ message: "Booking not found" });

    const artistProfile = await ArtistProfile.findOne({ user: booking.artist?._id }, "profilePicture fullName");
    const customerProfile = await CustomerProfile.findOne({ user: booking.customer?._id }, "profilePicture fullName");

    const enriched = {
      ...booking,
      artist: booking.artist
        ? { ...booking.artist, profilePicture: artistProfile?.profilePicture || null, fullName: artistProfile?.fullName || null }
        : booking.artist,
      customer: booking.customer
        ? { ...booking.customer, profilePicture: customerProfile?.profilePicture || null, fullName: customerProfile?.fullName || null }
        : booking.customer,
    };

    res.json(enriched);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get My Bookings (Role Based)
exports.getMyBookings = async (req, res) => {
  try {
    const ArtistProfile = require("../models/ArtistProfile");
    const CustomerProfile = require("../models/CustomerProfile");
    let bookings;

    if (req.user.role === "customer") {
      bookings = await Booking.find({ customer: req.user._id })
        .populate("artist", "name email")
        .lean();

      const artistIds = bookings.map((b) => b.artist?._id).filter(Boolean);
      const artistProfiles = await ArtistProfile.find({ user: { $in: artistIds } }, "user profilePicture");
      const picMap = {};
      artistProfiles.forEach((p) => { picMap[p.user.toString()] = p.profilePicture || null; });
      bookings = bookings.map((b) => ({
        ...b,
        artist: b.artist ? { ...b.artist, profilePicture: picMap[b.artist._id?.toString()] || null } : b.artist,
      }));
    } else if (req.user.role === "artist") {
      const receivedBookings = await Booking.find({ artist: req.user._id })
        .populate("customer", "name email")
        .lean();

      const placedBookings = await Booking.find({ customer: req.user._id })
        .populate("artist", "name email")
        .lean();

      const customerIds = receivedBookings.map((b) => b.customer?._id).filter(Boolean);
      const customerProfiles = await CustomerProfile.find({ user: { $in: customerIds } }, "user profilePicture");
      const artistProfilesForCustomers = await ArtistProfile.find({ user: { $in: customerIds } }, "user profilePicture");
      const custPicMap = {};
      customerProfiles.forEach((p) => { custPicMap[p.user.toString()] = p.profilePicture || null; });
      artistProfilesForCustomers.forEach((p) => {
        if (p.profilePicture) custPicMap[p.user.toString()] = p.profilePicture;
      });

      const enrichedReceived = receivedBookings.map((b) => ({
        ...b,
        customer: b.customer ? { ...b.customer, profilePicture: custPicMap[b.customer._id?.toString()] || null } : b.customer,
        _viewAs: "artist",
      }));

      const bookedArtistIds = placedBookings.map((b) => b.artist?._id).filter(Boolean);
      const bookedArtistProfiles = await ArtistProfile.find({ user: { $in: bookedArtistIds } }, "user profilePicture");
      const artistPicMap = {};
      bookedArtistProfiles.forEach((p) => { artistPicMap[p.user.toString()] = p.profilePicture || null; });

      const enrichedPlaced = placedBookings.map((b) => ({
        ...b,
        artist: b.artist ? { ...b.artist, profilePicture: artistPicMap[b.artist._id?.toString()] || null } : b.artist,
        _viewAs: "customer",
      }));

      bookings = [...enrichedReceived, ...enrichedPlaced];
    } else {
      return res.status(403).json({ message: "Unauthorized role" });
    }

    res.status(200).json(bookings);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};