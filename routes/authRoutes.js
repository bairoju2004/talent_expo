const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const passport = require("../config/passport");
const crypto = require("crypto");
const User = require("../models/User");
const bcrypt = require("bcryptjs");
const { sendWelcomeGoogleEmail } = require("../utils/emailService");
const {
  registerUser, loginUser, verifyEmail,
  resendVerificationEmail, forgotPassword,
  resetPassword, googleCallback,
} = require("../controllers/authController");
const { protect } = require("../middleware/authMiddleware");
const redis = require("../config/redis");

const generateToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "7d" });

router.post("/register", registerUser);
router.post("/login", loginUser);
router.get("/verify-email", verifyEmail);
router.post("/resend-verification", resendVerificationEmail);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);

// ── Google OAuth ──────────────────────────────────────────────────────────────

router.get("/google/login", (req, res, next) => {
  passport.authenticate("google", {
    scope: ["profile", "email"],
    session: false,
  })(req, res, next);
});

router.get("/google/register/customer", (req, res, next) => {
  passport.authenticate("google", {
    scope: ["profile", "email"],
    session: false,
  })(req, res, next);
});

router.get("/google/register/artist", (req, res, next) => {
  passport.authenticate("google", {
    scope: ["profile", "email"],
    session: false,
  })(req, res, next);
});

router.get("/google", (req, res, next) => {
  passport.authenticate("google", {
    scope: ["profile", "email"],
    session: false,
  })(req, res, next);
});

router.get("/google/callback", (req, res, next) => {
  passport.authenticate("google", { session: false }, async (err, user, info) => {
    if (err) {
      return res.redirect(`${process.env.CLIENT_URL}/login?error=google_failed`);
    }

    if (user) {
      req.user = user;
      return googleCallback(req, res);
    }

    const message  = info?.message || "no_account";
    const email    = info?.email || "";
    const name     = info?.name || "";
    const googleId = info?.googleId || "";

    if (message === "banned") {
      return res.redirect(`${process.env.CLIENT_URL}/login?error=banned`);
    }

    if (message === "no_account") {
      const intendedAction = req.cookies?.google_action || "login";

      if (intendedAction === "login") {
        return res.redirect(
          `${process.env.CLIENT_URL}/register?error=no_account&email=${encodeURIComponent(email)}&name=${encodeURIComponent(name)}`
        );
      }

      const role = intendedAction === "register_artist" ? "artist" : "customer";

      try {
        const newUser = await User.create({
          googleId,
          name,
          email,
          role,
          authProvider: "google",
          isEmailVerified: true,
          password: null,
        });

        try { await sendWelcomeGoogleEmail(email, name); } catch (e) {}

        const token = generateToken(newUser._id);

        res.clearCookie("google_action", { sameSite: 'none', secure: true });

        return res.redirect(
          `${process.env.CLIENT_URL}/auth/google/callback?token=${token}&id=${newUser._id}&name=${encodeURIComponent(newUser.name)}&email=${encodeURIComponent(newUser.email)}&role=${newUser.role}&isNew=true`
        );
      } catch (createErr) {
        console.error("Google register create error:", createErr.message);
        return res.redirect(`${process.env.CLIENT_URL}/register?error=google_failed`);
      }
    }

    return res.redirect(`${process.env.CLIENT_URL}/login?error=google_failed`);
  })(req, res, next);
});

// ── Cookie-setting routes ──────────────────────────────────────────────────────
router.get("/google/intent/login", (req, res) => {
  res.cookie("google_action", "login", {
    maxAge: 5 * 60 * 1000,
    httpOnly: true,
    sameSite: 'none',
    secure: true,
  });
  res.redirect("/api/auth/google/login");
});

router.get("/google/intent/register/customer", (req, res) => {
  res.cookie("google_action", "register_customer", {
    maxAge: 5 * 60 * 1000,
    httpOnly: true,
    sameSite: 'none',
    secure: true,
  });
  res.redirect("/api/auth/google/register/customer");
});

router.get("/google/intent/register/artist", (req, res) => {
  res.cookie("google_action", "register_artist", {
    maxAge: 5 * 60 * 1000,
    httpOnly: true,
    sameSite: 'none',
    secure: true,
  });
  res.redirect("/api/auth/google/register/artist");
});

// ── Logout ────────────────────────────────────────────────────────────────────
router.post("/logout", protect, async (req, res) => {
  try {
    const token = req.headers.authorization.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const ttl = decoded.exp - Math.floor(Date.now() / 1000);
    if (ttl > 0) {
      try { await redis.setEx(`blacklist:${token}`, ttl, "1"); }
      catch (e) { console.error("Redis blacklist failed:", e.message); }
    }
    res.json({ message: "Logged out successfully" });
  } catch (error) {
    res.json({ message: "Logged out" });
  }
});

module.exports = router;