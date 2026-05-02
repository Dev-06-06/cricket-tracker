const express = require("express");
const rateLimit = require("express-rate-limit");
const {
  register,
  login,
  me,
  updateProfile,
  forgotPassword,
  resetPassword,
  verifyEmail,
  resendOTP,
  googleAuth,
} = require("../controllers/authController");
const authMiddleware = require("../middleware/authMiddleware");

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many attempts, please try again later",
  },
});

const router = express.Router();

router.post("/register", authLimiter, register);
router.post("/login", authLimiter, login);
router.get("/me", authMiddleware, me);
router.put("/profile", authMiddleware, updateProfile);
router.post("/reset-password", authLimiter, resetPassword);
router.post("/verify-email", verifyEmail);
router.post("/resend-otp", resendOTP);
router.post("/forgot-password", forgotPassword);
router.post("/google", googleAuth);

module.exports = router;
