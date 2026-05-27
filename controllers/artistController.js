const ArtistProfile = require("../models/ArtistProfile");

// Create Artist Profile
const createArtistProfile = async (req, res) => {
  try {
    if (req.user.role !== "artist") {
      return res.status(403).json({ message: "Only artists can create profile" });
    }

    const { fullName, talentCategory, experience, description } = req.body;

    const existingProfile = await ArtistProfile.findOne({ user: req.user._id });
    if (existingProfile) {
      return res.status(400).json({ message: "Artist profile already exists" });
    }

    const profile = await ArtistProfile.create({
      user: req.user._id,
      fullName,
      talentCategory,
      experience,
      description,
    });

    res.status(201).json(profile);
  } catch (error) {
    res.status(500).json({ message: "Server Error" });
  }
};

// Get Artist Profile (own profile)
const getArtistProfile = async (req, res) => {
  try {
    const profile = await ArtistProfile.findOne({ user: req.user._id })
      .populate("user", "name email");

    if (!profile) {
      return res.status(404).json({ message: "Profile not found" });
    }

    res.json(profile);
  } catch (error) {
    res.status(500).json({ message: "Server Error" });
  }
};

// Update Artist Profile
const updateArtistProfile = async (req, res) => {
  try {
    const { fullName, talentCategory, experience, description } = req.body;

    // Get old profile to know which cache key to bust
    const old = await ArtistProfile.findOne({ user: req.user._id });

    const profile = await ArtistProfile.findOneAndUpdate(
      { user: req.user._id },
      { fullName, talentCategory, experience, description },
      { new: true }
    ).populate('user', 'name email');

    if (!profile) return res.status(404).json({ message: 'Profile not found' });

    // Bust old category cache and new category cache
    if (old?.talentCategory) await redis.del(`artists:talent:${old.talentCategory}`);
    if (talentCategory && talentCategory !== old?.talentCategory) {
      await redis.del(`artists:talent:${talentCategory}`);
    }

    res.json(profile);
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
};

// Get Artists by Talent (public)
const redis = require('../config/redis');

const getArtistsByTalent = async (req, res) => {
  try {
    const talent = req.query.talent;
    const cacheKey = `artists:talent:${talent}`;

    // Try cache first
    const cached = await redis.get(cacheKey);
    if (cached) {
      return res.json(JSON.parse(cached));
    }

    // Miss — query DB
    const artists = await ArtistProfile.find({ talentCategory: talent })
      .populate('user', 'name email');

    // Store in Redis for 5 minutes
    await redis.setEx(cacheKey, 300, JSON.stringify(artists));

    res.json(artists);
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
};

module.exports = {
  createArtistProfile,
  getArtistProfile,
  updateArtistProfile,
  getArtistsByTalent,
};