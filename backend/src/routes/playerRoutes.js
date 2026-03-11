const express = require("express");
const rateLimit = require("express-rate-limit");
const {
  getPlayers,
  createPlayer,
  getGroupPlayersWithStats,
} = require("../controllers/playerController");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

const createPlayerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
});

const getPlayersLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});

router.get("/", getPlayersLimiter, authMiddleware, getPlayers);
router.get("/by-group/:groupId", authMiddleware, getGroupPlayersWithStats);
router.post("/", createPlayerLimiter, authMiddleware, createPlayer);

module.exports = router;
