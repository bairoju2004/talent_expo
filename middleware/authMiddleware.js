const jwt = require("jsonwebtoken");
const User = require("../models/User");
const redis = require("../config/redis");

// ── protect — any authenticated user ─────────────────────────────────────────
const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
    try {
      token = req.headers.authorization.split(" ")[1];

      // Check token blacklist in Redis before anything else
      try {
        const blacklisted = await redis.get(`blacklist:${token}`);
        if (blacklisted) {
          return res.status(401).json({ message: "Token has been invalidated. Please log in again." });
        }
      } catch (cacheErr) {
        console.error("Redis blacklist check failed:", cacheErr.message);
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = await User.findById(decoded.id).select("-password");

      // Reject banned users immediately
      if (req.user?.isBanned) {
        return res.status(403).json({ message: "Your account has been suspended." });
      }

      next();
    } catch (error) {
      console.error(error);
      res.status(401).json({ message: "Not authorized, token failed" });
    }
  }

  if (!token) {
    res.status(401).json({ message: "Not authorized, no token" });
  }
};

// ── adminOnly — must be authenticated AND role === 'admin' ────────────────────
const adminOnly = (req, res, next) => {
  if (req.user && req.user.role === "admin") {
    next();
  } else {
    res.status(403).json({ message: "Access denied. Admins only." });
  }
};

module.exports = { protect, adminOnly };