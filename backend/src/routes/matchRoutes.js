const express = require("express");
const {
  createMatch,
  getMatch,
  getOngoingMatch,
} = require("../controllers/matchController");

const router = express.Router();

router.post("/", createMatch);
router.get("/ongoing", getOngoingMatch);
router.get("/:id", getMatch);

module.exports = router;
