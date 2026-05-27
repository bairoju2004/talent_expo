const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);

exports.sendVerificationEmail = async (to, name, token) => {
  const verifyUrl = `${process.env.CLIENT_URL}/verify-email?token=${token}`;
  await resend.emails.send({
    from: 'TalentExpo <onboarding@resend.dev>',
    to,
    subject: 'Verify your TalentExpo email address',
    html: `<p>Hi ${name},</p><p>Please verify your email: <a href="${verifyUrl}">${verifyUrl}</a></p><p>This link expires in 24 hours.</p>`,
  });
};

exports.sendPasswordResetEmail = async (to, name, token) => {
  const resetUrl = `${process.env.CLIENT_URL}/reset-password?token=${token}`;
  await resend.emails.send({
    from: 'TalentExpo <onboarding@resend.dev>',
    to,
    subject: 'Reset your TalentExpo password',
    html: `<p>Hi ${name},</p><p>Reset your password: <a href="${resetUrl}">${resetUrl}</a></p><p>This link expires in 1 hour.</p>`,
  });
};

exports.sendWelcomeGoogleEmail = async (to, name) => {
  await resend.emails.send({
    from: 'TalentExpo <onboarding@resend.dev>',
    to,
    subject: 'Welcome to TalentExpo!',
    html: `<p>Welcome ${name}! You have successfully signed in with Google.</p>`,
  });
};