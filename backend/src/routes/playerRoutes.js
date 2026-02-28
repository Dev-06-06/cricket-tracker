const express = require('express');
const rateLimit = require('express-rate-limit');
const { getPlayers, createPlayer } = require('../controllers/playerController');

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

router.get('/', getPlayersLimiter, getPlayers);
router.post('/', createPlayerLimiter, createPlayer);

module.exports = router;
