const Player = require('../models/Player');

const getPlayers = async (req, res) => {
  try {
    const players = await Player.find({}, '_id name').sort({ name: 1 });
    res.json({ success: true, players });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const createPlayer = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Name is required' });
    }
    const player = await Player.create({ name: name.trim() });
    res.status(201).json({ success: true, player });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getPlayers, createPlayer };
