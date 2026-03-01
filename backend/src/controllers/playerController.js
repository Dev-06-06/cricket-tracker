const Player = require("../models/Player");

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const getPlayers = async (req, res) => {
  try {
    const players = await Player.find({}).sort({ name: 1 });
    res.json({ success: true, players });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const createPlayer = async (req, res) => {
  try {
    const { name, photoUrl } = req.body;
    if (!name || !name.trim()) {
      return res
        .status(400)
        .json({ success: false, message: "Name is required" });
    }

    const trimmedName = name.trim();
    const existingPlayer = await Player.findOne({
      name: { $regex: `^${escapeRegExp(trimmedName)}$`, $options: "i" },
    });

    if (existingPlayer) {
      return res.status(409).json({
        success: false,
        message: "Player with this name already exists",
      });
    }

    const player = await Player.create({
      name: trimmedName,
      photoUrl: typeof photoUrl === "string" ? photoUrl.trim() : "",
    });
    res.status(201).json({ success: true, player });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getPlayers, createPlayer };
