const Match = require("../models/Match");

const createMatch = async (req, res) => {
  try {
    const { battingTeam, bowlingTeam, currentStriker, currentNonStriker, currentBowler } = req.body;
    
    const match = new Match({
      battingTeam,
      bowlingTeam,
      currentStriker,
      currentNonStriker,
      currentBowler
    });
    
    const savedMatch = await match.save();
    res.status(201).json({ success: true, match: savedMatch });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getMatch = async (req, res) => {
  try {
    const { id } = req.params;
    const match = await Match.findById(id);
    
    if (!match) {
      return res.status(404).json({ success: false, message: "Match not found" });
    }
    
    res.status(200).json({ success: true, match });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { createMatch, getMatch };