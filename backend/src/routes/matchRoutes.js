const express = require("express");
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

router.post("/", createMatch);
router.post("/upcoming", createUpcomingMatch);
router.post("/:id/start", startMatch);
router.get("/upcoming", listUpcomingMatches);
router.get("/live", listLiveMatches);
router.get("/completed", listCompletedMatches);
router.get("/ongoing", getOngoingMatch);
router.get("/:id", getMatch);
router.delete("/:id", deleteMatch);

module.exports = router;
