const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const User = require("../models/User");
const { sendWelcomeGoogleEmail } = require("../utils/emailService");

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: `${process.env.SERVER_URL}/api/auth/google/callback`,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value;
        const name = profile.displayName;
        const googleId = profile.id;

        if (!email) {
          return done(null, false, { message: "no_email" });
        }

        // Find existing user by googleId or email
        let user = await User.findOne({ $or: [{ googleId }, { email }] });

        if (user) {
          // Link Google if not already linked
          if (!user.googleId) {
            user.googleId = googleId;
            user.isEmailVerified = true;
            await user.save();
          }
          if (user.isBanned) {
            return done(null, false, { message: "banned" });
          }
          // Pass googleProfile so the callback route can decide what to do
          user._googleProfile = { email, name, googleId, isExisting: true };
          return done(null, user);
        }

        // No account found — pass the Google profile data forward
        // The callback route handler will decide: register or block based on the URL path used
        return done(null, false, { message: "no_account", email, name, googleId });
      } catch (error) {
        return done(error, null);
      }
    }
  )
);

passport.serializeUser((user, done) => done(null, user._id));
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

module.exports = passport;
