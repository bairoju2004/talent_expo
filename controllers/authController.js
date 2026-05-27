const crypto = require("crypto");
const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendWelcomeGoogleEmail,
} = require("../utils/emailService");

const generateToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "7d" });

// ── REGISTER USER (manual email) ─────────────────────────────────────────────
exports.registerUser = async (req, res) => {
  try {
    const { role, name, email, password } = req.body;

    if (role === "admin") {
      return res.status(403).json({ message: "Cannot register as admin." });
    }

    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const verificationToken = crypto.randomBytes(32).toString("hex");
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // Try sending email BEFORE creating user — if email is invalid, reject registration
    try {
      await sendVerificationEmail(email, name, verificationToken);
    } catch (emailErr) {
      console.error("Verification email failed:", emailErr.message);
      const errMsg = emailErr.message || "";
      const isInvalidAddress =
        errMsg.includes("550") || errMsg.includes("551") ||
        errMsg.includes("552") || errMsg.includes("553") ||
        errMsg.includes("554") || errMsg.includes("450") ||
        errMsg.includes("invalid") || errMsg.includes("does not exist") ||
        errMsg.includes("No such user") || errMsg.includes("unknown user") ||
        errMsg.includes("undeliverable") || errMsg.includes("rejected");

      return res.status(400).json({
        message: isInvalidAddress
          ? "This Gmail address does not exist. Please enter a real Gmail ID."
          : "Could not send verification email. Please check the email address and try again.",
      });
    }

    // Email sent — create the user
    const user = await User.create({
      role,
      name,
      email,
      password: hashedPassword,
      authProvider: "local",
      isEmailVerified: false,
      emailVerificationToken: verificationToken,
      emailVerificationExpires: verificationExpires,
    });

    // Return a temporary "pending" token so the verify-email page
    // can auto-login the user after they click the link
    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      isEmailVerified: false,
      message: "Registration successful! Verification link sent to your Gmail. Please verify to continue.",
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ── VERIFY EMAIL ─────────────────────────────────────────────────────────────
// After clicking the link in Gmail, user is verified and gets a real JWT
// so the frontend can auto-login and redirect to profile setup.
exports.verifyEmail = async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) {
      return res.status(400).json({ message: "Verification token is required." });
    }

    const user = await User.findOne({
      emailVerificationToken: token,
      emailVerificationExpires: { $gt: new Date() },
    });

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired verification link." });
    }

    user.isEmailVerified = true;
    user.emailVerificationToken = null;
    user.emailVerificationExpires = null;
    await user.save();

    // Return full login payload so frontend can auto-login + redirect to profile page
    res.json({
      verified: true,
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      isEmailVerified: true,
      token: generateToken(user._id),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ── RESEND VERIFICATION EMAIL ─────────────────────────────────────────────────
exports.resendVerificationEmail = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) {
      return res.json({ message: "If that email is registered, a verification link has been sent." });
    }
    if (user.isEmailVerified) {
      return res.status(400).json({ message: "This email is already verified." });
    }

    const verificationToken = crypto.randomBytes(32).toString("hex");
    user.emailVerificationToken = verificationToken;
    user.emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await user.save();

    await sendVerificationEmail(email, user.name, verificationToken);
    res.json({ message: "Verification email resent. Please check your inbox." });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ── LOGIN USER ────────────────────────────────────────────────────────────────
exports.loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    if (user.authProvider === "google") {
      return res.status(400).json({
        message: "This account uses Google Sign-In. Please click 'Continue with Google' to log in.",
      });
    }

    if (!(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    if (user.isBanned) {
      return res.status(403).json({
        message: `Your account has been suspended${user.banReason ? `: ${user.banReason}` : "."}`,
      });
    }

    if (!user.isEmailVerified) {
      return res.status(403).json({
        message: "Please verify your email before logging in. Check your Gmail inbox for the verification link.",
        isEmailVerified: false,
        email: user.email,
      });
    }

    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      isEmailVerified: user.isEmailVerified,
      token: generateToken(user._id),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ── FORGOT PASSWORD ───────────────────────────────────────────────────────────
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    const genericMessage = "If that email is registered, a password reset link has been sent.";

    if (!user) return res.json({ message: genericMessage });

    if (user.authProvider === "google") {
      return res.status(400).json({
        message: "This account uses Google Sign-In and does not have a password to reset.",
      });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    user.passwordResetToken = resetToken;
    user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000);
    await user.save();

    try {
      await sendPasswordResetEmail(email, user.name, resetToken);
    } catch (emailErr) {
      console.error("Password reset email failed:", emailErr.message);
      return res.status(500).json({ message: "Failed to send reset email. Please try again." });
    }

    res.json({ message: genericMessage });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ── RESET PASSWORD ────────────────────────────────────────────────────────────
exports.resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      return res.status(400).json({ message: "Token and new password are required." });
    }

    const user = await User.findOne({
      passwordResetToken: token,
      passwordResetExpires: { $gt: new Date() },
    });

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired password reset link." });
    }

    user.password = await bcrypt.hash(password, 10);
    user.passwordResetToken = null;
    user.passwordResetExpires = null;
    await user.save();

    res.json({ message: "Password reset successfully. You can now log in with your new password." });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ── GOOGLE OAUTH CALLBACK ─────────────────────────────────────────────────────
exports.googleCallback = async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return res.redirect(`${process.env.CLIENT_URL}/login?error=google_failed`);
    }

    const token = generateToken(user._id);
    res.redirect(
      `${process.env.CLIENT_URL}/auth/google/callback?token=${token}&id=${user._id}&name=${encodeURIComponent(user.name)}&email=${encodeURIComponent(user.email)}&role=${user.role}&isNew=${user.isNew || false}`
    );
  } catch (error) {
    console.error("Google callback error:", error);
    res.redirect(`${process.env.CLIENT_URL}/login?error=google_failed`);
  }
};
