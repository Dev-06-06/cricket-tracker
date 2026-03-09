const mongoose = require("mongoose");
const Group = require("../models/Group");
const Player = require("../models/Player");
const GroupPlayerStats = require("../models/GroupPlayerStats");
const User = require("../models/User");

const normalizeInviteCode = (code) =>
  typeof code === "string" ? code.trim().toUpperCase() : "";

const isMember = (group, userId) =>
  group.members.some((m) => m.user.toString() === userId.toString());

// Ensures a Player doc exists for this user and adds it to the group pool.
// Also creates a GroupPlayerStats doc for this player+group (upsert).
async function ensureUserInPlayerPool(userId, groupId) {
  const user = await User.findById(userId).select("name photoUrl");
  if (!user) return;

  // Find or create the Player document linked to this user
  let player = await Player.findOne({ userId });
  if (!player) {
    player = await Player.create({
      name: user.name,
      photoUrl: user.photoUrl || "",
      userId,
    });
  }

  // Add to group pool (no-op if already present)
  await Group.findByIdAndUpdate(groupId, {
    $addToSet: { playerPool: player._id },
  });

  // Ensure a GroupPlayerStats record exists (upsert — zero stats on creation)
  await GroupPlayerStats.updateOne(
    { playerId: player._id, groupId },
    { $setOnInsert: { playerId: player._id, groupId } },
    { upsert: true },
  );
}

// ─── createGroup ─────────────────────────────────────────────────────────────
const createGroup = async (req, res) => {
  try {
    const { name, description } = req.body;
    const currentUserId = req.user._id;

    if (!name?.trim()) {
      return res.status(400).json({ success: false, message: "Group name is required" });
    }

    const group = await Group.create({
      name: name.trim(),
      description: typeof description === "string" ? description.trim() : "",
      createdBy: currentUserId,
      members: [{ user: currentUserId, role: "admin" }],
      playerPool: [],
    });

    // ✅ No longer writes to User.groups — single source of truth is Group.members
    await ensureUserInPlayerPool(currentUserId, group._id);

    return res.status(201).json({ success: true, group });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─── getMyGroups ──────────────────────────────────────────────────────────────
const getMyGroups = async (req, res) => {
  try {
    // ✅ Hits the { "members.user": 1 } index directly
    const groups = await Group.find({ "members.user": req.user._id })
      .populate("createdBy", "name email photoUrl")
      .populate("members.user", "name email photoUrl")
      .sort({ createdAt: -1 });

    return res.status(200).json({ success: true, groups });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─── joinGroup ────────────────────────────────────────────────────────────────
const joinGroup = async (req, res) => {
  try {
    const { inviteCode } = req.body;
    const normalizedCode = normalizeInviteCode(inviteCode);

    if (!normalizedCode) {
      return res.status(400).json({ success: false, message: "Invite code is required" });
    }

    // ✅ Hits the unique index on inviteCode
    const group = await Group.findOne({ inviteCode: normalizedCode });
    if (!group) {
      return res.status(404).json({ success: false, message: "Group not found" });
    }

    if (isMember(group, req.user._id)) {
      return res.status(200).json({
        success: true,
        message: "Already a member of this group",
        group,
      });
    }

    group.members.push({ user: req.user._id, role: "member" });
    await group.save();

    // ✅ No longer writes to User.groups
    await ensureUserInPlayerPool(req.user._id, group._id);

    return res.status(200).json({ success: true, group });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─── leaveGroup ───────────────────────────────────────────────────────────────
const leaveGroup = async (req, res) => {
  try {
    const { groupId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).json({ success: false, message: "Invalid group id" });
    }

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ success: false, message: "Group not found" });
    }

    if (!isMember(group, req.user._id)) {
      return res.status(403).json({ success: false, message: "You are not a member of this group" });
    }

    group.members = group.members.filter(
      (m) => m.user.toString() !== req.user._id.toString(),
    );
    await group.save();

    // ✅ No longer needs to update User.groups — one write instead of two
    return res.status(200).json({ success: true, group });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─── getGroupPlayers ──────────────────────────────────────────────────────────
const getGroupPlayers = async (req, res) => {
  try {
    const { groupId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).json({ success: false, message: "Invalid group id" });
    }

    const group = await Group.findById(groupId).populate("playerPool");
    if (!group) {
      return res.status(404).json({ success: false, message: "Group not found" });
    }

    if (!isMember(group, req.user._id)) {
      return res.status(403).json({ success: false, message: "You are not a member of this group" });
    }

    return res.status(200).json({ success: true, players: group.playerPool });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─── addGroupPlayer ───────────────────────────────────────────────────────────
const addGroupPlayer = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { playerId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).json({ success: false, message: "Invalid group id" });
    }

    if (!mongoose.Types.ObjectId.isValid(playerId)) {
      return res.status(400).json({ success: false, message: "Invalid player id" });
    }

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ success: false, message: "Group not found" });
    }

    if (!isMember(group, req.user._id)) {
      return res.status(403).json({ success: false, message: "You are not a member of this group" });
    }

    const player = await Player.findById(playerId);
    if (!player) {
      return res.status(404).json({ success: false, message: "Player not found" });
    }

    if (group.playerPool.some((id) => id.toString() === playerId)) {
      return res.status(400).json({ success: false, message: "Player already in pool" });
    }

    group.playerPool.push(player._id);
    await group.save();

    // ✅ Create GroupPlayerStats record for this player in this group
    await GroupPlayerStats.updateOne(
      { playerId: player._id, groupId },
      { $setOnInsert: { playerId: player._id, groupId } },
      { upsert: true },
    );

    const updatedGroup = await Group.findById(groupId).populate("playerPool");
    return res.status(200).json({ success: true, players: updatedGroup.playerPool });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─── removeGroupPlayer ────────────────────────────────────────────────────────
const removeGroupPlayer = async (req, res) => {
  try {
    const { groupId, playerId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).json({ success: false, message: "Invalid group id" });
    }

    if (!mongoose.Types.ObjectId.isValid(playerId)) {
      return res.status(400).json({ success: false, message: "Invalid player id" });
    }

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ success: false, message: "Group not found" });
    }

    if (!isMember(group, req.user._id)) {
      return res.status(403).json({ success: false, message: "You are not a member of this group" });
    }

    group.playerPool = group.playerPool.filter(
      (id) => id.toString() !== playerId,
    );
    await group.save();

    const updatedGroup = await Group.findById(groupId).populate("playerPool");
    return res.status(200).json({ success: true, players: updatedGroup.playerPool });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  createGroup,
  getMyGroups,
  joinGroup,
  leaveGroup,
  getGroupPlayers,
  addGroupPlayer,
  removeGroupPlayer,
};