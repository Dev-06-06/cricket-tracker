const mongoose = require("mongoose");
const Group = require("../models/Group");
const Player = require("../models/Player");
const User = require("../models/User");

const normalizeInviteCode = (inviteCode) =>
  typeof inviteCode === "string" ? inviteCode.trim().toUpperCase() : "";

const isMember = (group, userId) =>
  group.members.some((member) => member.user.toString() === userId.toString());

/**
 * Ensures a Player document exists for the given user and adds it
 * to the group's playerPool (idempotent - uses $addToSet).
 */
async function ensureUserInPlayerPool(userId, groupId) {
  const user = await User.findById(userId).select("name photoUrl");
  if (!user) return;

  // Find existing player linked to this user, or create a new one
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
}

const createGroup = async (req, res) => {
  try {
    const { name, description } = req.body;
    const currentUserId = req.user._id;

    if (!name?.trim()) {
      return res
        .status(400)
        .json({ success: false, message: "Group name is required" });
    }

    const group = await Group.create({
      name: name.trim(),
      description: typeof description === "string" ? description.trim() : "",
      createdBy: currentUserId,
      members: [{ user: currentUserId, role: "admin" }],
      playerPool: [],
    });

    await User.findByIdAndUpdate(currentUserId, {
      $addToSet: { groups: group._id },
    });

    // Auto-add group creator to the player pool
    await ensureUserInPlayerPool(currentUserId, group._id);

    return res.status(201).json({ success: true, group });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getMyGroups = async (req, res) => {
  try {
    const groups = await Group.find({ "members.user": req.user._id })
      .populate("createdBy", "name email photoUrl")
      .populate("members.user", "name email photoUrl")
      .sort({ createdAt: -1 });

    return res.status(200).json({ success: true, groups });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const joinGroup = async (req, res) => {
  try {
    const { inviteCode } = req.body;
    const normalizedCode = normalizeInviteCode(inviteCode);

    if (!normalizedCode) {
      return res
        .status(400)
        .json({ success: false, message: "Invite code is required" });
    }

    const group = await Group.findOne({ inviteCode: normalizedCode });
    if (!group) {
      return res
        .status(404)
        .json({ success: false, message: "Group not found" });
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

    await User.findByIdAndUpdate(req.user._id, {
      $addToSet: { groups: group._id },
    });

    // Auto-add joining user to the group's player pool
    await ensureUserInPlayerPool(req.user._id, group._id);

    return res.status(200).json({ success: true, group });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const leaveGroup = async (req, res) => {
  try {
    const { groupId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid group id" });
    }

    const group = await Group.findById(groupId);
    if (!group) {
      return res
        .status(404)
        .json({ success: false, message: "Group not found" });
    }

    if (!isMember(group, req.user._id)) {
      return res.status(403).json({
        success: false,
        message: "You are not a member of this group",
      });
    }

    group.members = group.members.filter(
      (member) => member.user.toString() !== req.user._id.toString(),
    );
    await group.save();

    await User.findByIdAndUpdate(req.user._id, {
      $pull: { groups: group._id },
    });

    return res.status(200).json({ success: true, group });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getGroupPlayers = async (req, res) => {
  try {
    const { groupId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid group id" });
    }

    const group = await Group.findById(groupId).populate("playerPool");
    if (!group) {
      return res
        .status(404)
        .json({ success: false, message: "Group not found" });
    }

    if (!isMember(group, req.user._id)) {
      return res.status(403).json({
        success: false,
        message: "You are not a member of this group",
      });
    }

    return res.status(200).json({ success: true, players: group.playerPool });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const addGroupPlayer = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { playerId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid group id" });
    }

    if (!mongoose.Types.ObjectId.isValid(playerId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid player id" });
    }

    const [group, player] = await Promise.all([
      Group.findById(groupId),
      Player.findById(playerId),
    ]);

    if (!group) {
      return res
        .status(404)
        .json({ success: false, message: "Group not found" });
    }

    if (!isMember(group, req.user._id)) {
      return res.status(403).json({
        success: false,
        message: "You are not a member of this group",
      });
    }

    if (!player) {
      return res
        .status(404)
        .json({ success: false, message: "Player not found" });
    }

    const alreadyInPool = group.playerPool.some(
      (existingPlayerId) => existingPlayerId.toString() === playerId,
    );

    if (alreadyInPool) {
      return res.status(200).json({
        success: true,
        message: "Player already in group player pool",
      });
    }

    group.playerPool.push(player._id);
    await group.save();

    const updatedGroup = await Group.findById(groupId).populate("playerPool");

    return res
      .status(200)
      .json({ success: true, players: updatedGroup.playerPool });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const removeGroupPlayer = async (req, res) => {
  try {
    const { groupId, playerId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid group id" });
    }

    if (!mongoose.Types.ObjectId.isValid(playerId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid player id" });
    }

    const group = await Group.findById(groupId);
    if (!group) {
      return res
        .status(404)
        .json({ success: false, message: "Group not found" });
    }

    if (!isMember(group, req.user._id)) {
      return res.status(403).json({
        success: false,
        message: "You are not a member of this group",
      });
    }

    group.playerPool = group.playerPool.filter(
      (existingId) => existingId.toString() !== playerId,
    );
    await group.save();

    const updatedGroup = await Group.findById(groupId).populate("playerPool");
    return res
      .status(200)
      .json({ success: true, players: updatedGroup.playerPool });
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
