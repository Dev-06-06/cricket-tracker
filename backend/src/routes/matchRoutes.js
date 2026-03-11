const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const {
  createMatch,
  createUpcomingMatch,
  deleteMatch,
  getMatch,
  getOngoingMatch,
  listCompletedMatches,
  listUpcomingMatches,
  listLiveMatches,
  startMatch,
} = require("../controllers/matchController");

const router = express.Router();

router.post("/", authMiddleware, createMatch);
router.post("/upcoming", authMiddleware, createUpcomingMatch);
router.post("/:id/start", authMiddleware, startMatch);
router.get("/upcoming", authMiddleware, listUpcomingMatches);
router.get("/live", authMiddleware, listLiveMatches);
router.get("/completed", authMiddleware, listCompletedMatches);
router.get("/ongoing", authMiddleware, getOngoingMatch);
router.get("/:id", authMiddleware, getMatch);
router.delete("/:id", authMiddleware, deleteMatch);

module.exports = router;
