const CustomerProfile = require("../models/CustomerProfile");

// Create Customer Profile
const createCustomerProfile = async (req, res) => {
  try {
    if (req.user.role !== "customer") {
      return res.status(403).json({ message: "Only customers can create profile" });
    }

    const { fullName, phoneNumber, location, bio } = req.body;

    const existingProfile = await CustomerProfile.findOne({ user: req.user._id });
    if (existingProfile) {
      return res.status(400).json({ message: "Customer profile already exists" });
    }

    const profile = await CustomerProfile.create({
      user: req.user._id,
      fullName,
      phoneNumber,
      location,
      bio,
    });

    res.status(201).json(profile);
  } catch (error) {
    res.status(500).json({ message: "Server Error" });
  }
};

// Get Customer Profile
const getCustomerProfile = async (req, res) => {
  try {
    const profile = await CustomerProfile.findOne({ user: req.user._id })
      .populate("user", "name email");

    if (!profile) {
      return res.status(404).json({ message: "Profile not found" });
    }

    res.json(profile);
  } catch (error) {
    res.status(500).json({ message: "Server Error" });
  }
};

// Update Customer Profile
const updateCustomerProfile = async (req, res) => {
  try {
    const { fullName, phoneNumber, location, bio } = req.body;

    const profile = await CustomerProfile.findOneAndUpdate(
      { user: req.user._id },
      { fullName, phoneNumber, location, bio },
      { new: true } // returns updated document
    ).populate("user", "name email");

    if (!profile) {
      return res.status(404).json({ message: "Profile not found" });
    }

    res.json(profile);
  } catch (error) {
    res.status(500).json({ message: "Server Error" });
  }
};

module.exports = { createCustomerProfile, getCustomerProfile, updateCustomerProfile };