const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Player = require("../models/Player");

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
      return res.status(409).json({
        success: false,
        message: "User already exists with this email",
      });
    }

    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password,
    });

    const token = buildToken(user._id);
    return res.status(201).json({ success: true, token, user: formatUser(user) });
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
    const user = await User.findOne({ email: normalizedEmail }).select("+password");

    if (!user) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    const token = buildToken(user._id);
    return res.status(200).json({ success: true, token, user: formatUser(user) });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const me = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
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
      return res.status(400).json({ success: false, message: "Name cannot be empty" });
    }

    const existingUser = await User.findById(req.user.id).select("name photoUrl").lean();
    if (!existingUser) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const updateData = {};
    if (typeof name === "string") updateData.name = name.trim();
    if (typeof photoUrl === "string") updateData.photoUrl = photoUrl.trim();

    const updated = await User.findByIdAndUpdate(req.user.id, updateData, {
      new: true,
    }).select("-password");

    if (!updated) {
      return res.status(404).json({ success: false, message: "User not found" });
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

const resetPassword = async (req, res) => {
  try {
    const { name, email, newPassword } = req.body;

    if (!name || !email || !newPassword) {
      return res.status(400).json({ 
        success: false, 
        message: "Name, email and new password are required" 
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ 
        success: false, 
        message: "Password must be at least 6 characters" 
      });
    }

    const user = await User.findOne({ 
      email: email.toLowerCase().trim() 
    });

    if (!user) {
      return res.status(400).json({ 
        success: false, 
        message: "No account found with that name and email" 
      });
    }

    const nameMatches = 
      user.name.toLowerCase().trim() === name.toLowerCase().trim();

    if (!nameMatches) {
      return res.status(400).json({ 
        success: false, 
        message: "No account found with that name and email" 
      });
    }

    user.password = newPassword;
    await user.save();

    res.status(200).json({ 
      success: true, 
      message: "Password reset successful. You can now log in." 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

module.exports = { register, login, me, updateProfile, resetPassword };