const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Player = require("../models/Player");
const bcrypt = require("bcryptjs");
const { sendOTPEmail, generateOTP } = require("../utils/mailer");
const crypto = require("crypto");

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const getJwtSecret = () => {
  if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET is not configured");
  return process.env.JWT_SECRET;
};

const buildToken = (userId) =>
  jwt.sign({ userId }, getJwtSecret(), { expiresIn: "15d" });

// Clean user shape — no more `groups` field (removed from User model)
const formatUser = (user) => ({
  _id: user._id,
  name: user.name,
  email: user.email,
  photoUrl: user.photoUrl,
  createdAt: user.createdAt,
});

const register = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name?.trim() || !email?.trim() || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, email and password are required",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existingUser = await User.findOne({ email: normalizedEmail });

    if (existingUser) {
      // If user exists but is unverified, resend OTP instead of rejecting
      if (!existingUser.isVerified) {
        const otp = generateOTP();
        const hash = await bcrypt.hash(otp, 10);
        existingUser.emailOTP = hash;
        existingUser.emailOTPExpiry = new Date(Date.now() + 10 * 60 * 1000);
        await existingUser.save();
        try {
          await sendOTPEmail({
            to: normalizedEmail,
            subject: "CricTrack — Verify your account",
            otp,
            purpose: "verify",
          });
        } catch (mailErr) {
          console.error("Failed to send OTP email:", mailErr.message);
        }
        return res.status(200).json({
          success: true,
          requiresVerification: true,
          message: "Account exists but is unverified. A new OTP has been sent.",
        });
      }
      return res.status(409).json({
        success: false,
        message: "User already exists with this email",
      });
    }

    const otp = generateOTP();
    const hash = await bcrypt.hash(otp, 10);

    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password,
      isVerified: false,
      emailOTP: hash,
      emailOTPExpiry: new Date(Date.now() + 10 * 60 * 1000),
    });

    try {
      await sendOTPEmail({
        to: normalizedEmail,
        subject: "CricTrack — Verify your account",
        otp,
        purpose: "verify",
      });
    } catch (mailErr) {
      console.error("Failed to send OTP email:", mailErr.message);
    }

    return res.status(201).json({
      success: true,
      requiresVerification: true,
      message: "Account created. Please check your email for the OTP.",
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email?.trim() || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail }).select(
      "+password +isVerified",
    );

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    // Block Google-only users from password login
    if (user.authProvider === "google" && !user.password) {
      return res.status(400).json({
        success: false,
        message: "This account uses Google login. Please sign in with Google.",
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    // Block unverified users
    if (!user.isVerified) {
      return res.status(403).json({
        success: false,
        requiresVerification: true,
        message: "Please verify your email before logging in.",
      });
    }

    const token = buildToken(user._id);
    return res.status(200).json({
      success: true,
      token,
      user: formatUser(user),
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const verifyEmail = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email?.trim() || !otp?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Email and OTP are required",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail }).select(
      "+emailOTP +emailOTPExpiry +isVerified",
    );

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "No account found with this email",
      });
    }

    if (user.isVerified) {
      return res.status(400).json({
        success: false,
        message: "Account is already verified",
      });
    }

    if (!user.emailOTP || !user.emailOTPExpiry) {
      return res.status(400).json({
        success: false,
        message: "No OTP found. Please request a new one.",
      });
    }

    if (new Date() > user.emailOTPExpiry) {
      return res.status(400).json({
        success: false,
        message: "OTP has expired. Please request a new one.",
      });
    }

    const isOTPValid = await bcrypt.compare(otp.trim(), user.emailOTP);
    if (!isOTPValid) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP",
      });
    }

    user.isVerified = true;
    user.emailOTP = null;
    user.emailOTPExpiry = null;
    await user.save();

    const token = buildToken(user._id);
    return res.status(200).json({
      success: true,
      token,
      user: formatUser(user),
      message: "Email verified successfully",
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const resendOTP = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail }).select(
      "+isVerified +emailOTPExpiry",
    );

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "No account found with this email",
      });
    }

    if (user.isVerified) {
      return res.status(400).json({
        success: false,
        message: "Account is already verified",
      });
    }

    const otp = generateOTP();
    const hash = await bcrypt.hash(otp, 10);
    user.emailOTP = hash;
    user.emailOTPExpiry = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();

    try {
      await sendOTPEmail({
        to: normalizedEmail,
        subject: "CricTrack — New verification OTP",
        otp,
        purpose: "verify",
      });
    } catch (mailErr) {
      console.error("Failed to send OTP email:", mailErr.message);
    }

    return res.status(200).json({
      success: true,
      message: "New OTP sent to your email",
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const googleAuth = async (req, res) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({
        success: false,
        message: "Google ID token is required",
      });
    }

    // Verify token with Google
    const googleRes = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`,
    );

    if (!googleRes.ok) {
      return res.status(401).json({
        success: false,
        message: "Invalid Google token",
      });
    }

    const payload = await googleRes.json();

    // Verify the token was issued for your app
    if (payload.aud !== process.env.GOOGLE_CLIENT_ID) {
      return res.status(401).json({
        success: false,
        message: "Token was not issued for this app",
      });
    }

    if (!payload.email_verified) {
      return res.status(401).json({
        success: false,
        message: "Google email is not verified",
      });
    }

    const { sub: googleId, email, name, picture } = payload;
    const normalizedEmail = email.trim().toLowerCase();

    // Case 1: User already exists with this googleId
    let user = await User.findOne({ googleId });

    if (user) {
      const token = buildToken(user._id);
      return res.status(200).json({
        success: true,
        token,
        user: formatUser(user),
      });
    }

    // Case 2: User exists with same email (local account) — link it
    user = await User.findOne({ email: normalizedEmail });

    if (user) {
      user.googleId = googleId;
      if (!user.photoUrl && picture) user.photoUrl = picture;
      // Mark verified if not already
      if (!user.isVerified) user.isVerified = true;
      await user.save();

      const token = buildToken(user._id);
      return res.status(200).json({
        success: true,
        token,
        user: formatUser(user),
      });
    }

    // Case 3: Brand new user via Google
    user = await User.create({
      name: name || "CricTrack User",
      email: normalizedEmail,
      googleId,
      authProvider: "google",
      isVerified: true,
      photoUrl: picture || "",
      // No password — Google users don't have one
    });

    const token = buildToken(user._id);
    return res.status(201).json({
      success: true,
      token,
      user: formatUser(user),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const me = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }
    return res.status(200).json({ success: true, user: formatUser(user) });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const updateProfile = async (req, res) => {
  try {
    const { name, photoUrl } = req.body;

    if (name != null && typeof name === "string" && !name.trim()) {
      return res
        .status(400)
        .json({ success: false, message: "Name cannot be empty" });
    }

    const existingUser = await User.findById(req.user.id)
      .select("name photoUrl")
      .lean();
    if (!existingUser) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const updateData = {};
    if (typeof name === "string") updateData.name = name.trim();
    if (typeof photoUrl === "string") updateData.photoUrl = photoUrl.trim();

    const updated = await User.findByIdAndUpdate(req.user.id, updateData, {
      new: true,
    }).select("-password");

    if (!updated) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    // Keep player photo in sync across all Player docs linked to this user
    if (updateData.photoUrl !== undefined) {
      await Player.updateMany(
        { userId: req.user.id },
        { $set: { photoUrl: updated.photoUrl || "" } },
      );
    }

    return res.status(200).json({ success: true, user: formatUser(updated) });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });

    // Always return 200 to prevent email enumeration
    if (!user) {
      return res.status(200).json({
        success: true,
        message: "If an account exists, an OTP has been sent.",
      });
    }

    // Block Google-only users
    if (user.authProvider === "google" && !user.password) {
      return res.status(400).json({
        success: false,
        message:
          "This account uses Google login. Password reset is not available.",
      });
    }

    const otp = generateOTP();
    const hash = await bcrypt.hash(otp, 10);
    user.passwordResetOTP = hash;
    user.passwordResetExpiry = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();

    try {
      await sendOTPEmail({
        to: normalizedEmail,
        subject: "CricTrack — Password reset OTP",
        otp,
        purpose: "reset",
      });
    } catch (mailErr) {
      console.error("Failed to send OTP email:", mailErr.message);
    }

    return res.status(200).json({
      success: true,
      message: "If an account exists, an OTP has been sent.",
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const resetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email?.trim() || !otp?.trim() || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Email, OTP and new password are required",
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail }).select(
      "+passwordResetOTP +passwordResetExpiry +password",
    );

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired OTP",
      });
    }

    if (!user.passwordResetOTP || !user.passwordResetExpiry) {
      return res.status(400).json({
        success: false,
        message: "No reset request found. Please request a new OTP.",
      });
    }

    if (new Date() > user.passwordResetExpiry) {
      return res.status(400).json({
        success: false,
        message: "OTP has expired. Please request a new one.",
      });
    }

    const isOTPValid = await bcrypt.compare(otp.trim(), user.passwordResetOTP);
    if (!isOTPValid) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP",
      });
    }

    user.password = newPassword;
    user.passwordResetOTP = null;
    user.passwordResetExpiry = null;
    await user.save();

    return res.status(200).json({
      success: true,
      message: "Password reset successful. You can now log in.",
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  register,
  login,
  me,
  updateProfile,
  forgotPassword,
  resetPassword,
  verifyEmail,
  resendOTP,
  googleAuth,
};
