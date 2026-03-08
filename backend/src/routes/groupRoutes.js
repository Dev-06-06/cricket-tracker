const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const {
  createGroup,
  getMyGroups,
  joinGroup,
  leaveGroup,
  getGroupPlayers,
  addGroupPlayer,
  removeGroupPlayer,
} = require("../controllers/groupController");

const router = express.Router();

router.post("/", authMiddleware, createGroup);
router.get("/", authMiddleware, getMyGroups);
router.post("/join", authMiddleware, joinGroup);
router.post("/:groupId/leave", authMiddleware, leaveGroup);
router.get("/:groupId/players", authMiddleware, getGroupPlayers);
router.post("/:groupId/players", authMiddleware, addGroupPlayer);
router.delete("/:groupId/players/:playerId", authMiddleware, removeGroupPlayer);

module.exports = router;
