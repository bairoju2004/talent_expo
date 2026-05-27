const nodemailer = require("nodemailer");

/**
 * Create a reusable transporter using Gmail SMTP.
 * Credentials are read from environment variables.
 */
const createTransporter = () => {
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
};

/**
 * Send a registration welcome + email verification email.
 */
exports.sendVerificationEmail = async (to, name, token) => {
  const transporter = createTransporter();
  const verifyUrl = `${process.env.CLIENT_URL}/verify-email?token=${token}`;

  await transporter.sendMail({
    from: `"TalentExpo" <${process.env.EMAIL_USER}>`,
    to,
    subject: "Verify your TalentExpo email address",
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px;background:#f9f5ff;border-radius:12px;">
        <div style="text-align:center;margin-bottom:24px;">
          <h1 style="color:#7c3aed;margin:0;">🎭 TalentExpo</h1>
        </div>
        <div style="background:#fff;border-radius:10px;padding:28px;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
          <h2 style="color:#1f2937;margin-top:0;">Welcome, ${name}! 🎉</h2>
          <p style="color:#4b5563;">Thanks for registering on TalentExpo. Please verify your email address to activate your account.</p>
          <div style="text-align:center;margin:28px 0;">
            <a href="${verifyUrl}"
               style="background:#7c3aed;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px;display:inline-block;">
              Verify Email Address
            </a>
          </div>
          <p style="color:#6b7280;font-size:13px;">This link expires in <strong>24 hours</strong>. If you didn't create an account, you can safely ignore this email.</p>
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;" />
          <p style="color:#9ca3af;font-size:12px;text-align:center;">
            If the button doesn't work, copy this link:<br/>
            <a href="${verifyUrl}" style="color:#7c3aed;word-break:break-all;">${verifyUrl}</a>
          </p>
        </div>
      </div>
    `,
  });
};

/**
 * Send a password reset email.
 */
exports.sendPasswordResetEmail = async (to, name, token) => {
  const transporter = createTransporter();
  const resetUrl = `${process.env.CLIENT_URL}/reset-password?token=${token}`;

  await transporter.sendMail({
    from: `"TalentExpo" <${process.env.EMAIL_USER}>`,
    to,
    subject: "Reset your TalentExpo password",
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px;background:#f9f5ff;border-radius:12px;">
        <div style="text-align:center;margin-bottom:24px;">
          <h1 style="color:#7c3aed;margin:0;">🎭 TalentExpo</h1>
        </div>
        <div style="background:#fff;border-radius:10px;padding:28px;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
          <h2 style="color:#1f2937;margin-top:0;">Password Reset Request 🔐</h2>
          <p style="color:#4b5563;">Hi <strong>${name}</strong>, we received a request to reset your password.</p>
          <div style="text-align:center;margin:28px 0;">
            <a href="${resetUrl}"
               style="background:#7c3aed;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px;display:inline-block;">
              Reset Password
            </a>
          </div>
          <p style="color:#6b7280;font-size:13px;">This link expires in <strong>1 hour</strong>. If you didn't request a password reset, you can safely ignore this email.</p>
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;" />
          <p style="color:#9ca3af;font-size:12px;text-align:center;">
            If the button doesn't work, copy this link:<br/>
            <a href="${resetUrl}" style="color:#7c3aed;word-break:break-all;">${resetUrl}</a>
          </p>
        </div>
      </div>
    `,
  });
};

/**
 * Send a welcome email when a user logs in via Google.
 */
exports.sendWelcomeGoogleEmail = async (to, name) => {
  const transporter = createTransporter();

  await transporter.sendMail({
    from: `"TalentExpo" <${process.env.EMAIL_USER}>`,
    to,
    subject: "Welcome to TalentExpo!",
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px;background:#f9f5ff;border-radius:12px;">
        <div style="text-align:center;margin-bottom:24px;">
          <h1 style="color:#7c3aed;margin:0;">🎭 TalentExpo</h1>
        </div>
        <div style="background:#fff;border-radius:10px;padding:28px;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
          <h2 style="color:#1f2937;margin-top:0;">Welcome, ${name}! 🎉</h2>
          <p style="color:#4b5563;">You've successfully signed in to TalentExpo with your Google account.</p>
          <p style="color:#4b5563;">You can now explore artists, make bookings, and much more. Enjoy!</p>
          <div style="text-align:center;margin:24px 0;">
            <a href="${process.env.CLIENT_URL}/browse"
               style="background:#7c3aed;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px;display:inline-block;">
              Explore TalentExpo
            </a>
          </div>
        </div>
      </div>
    `,
  });
};