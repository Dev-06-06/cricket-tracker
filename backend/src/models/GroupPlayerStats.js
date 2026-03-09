const mongoose = require("mongoose");

// ─── GroupPlayerStats ─────────────────────────────────────────────────────────
//
// One document per (player, group) pair.
//
// QUERY PATTERNS this model is designed for:
//
//   1. "Get all players with their stats for group X"  (PlayerProfilesPage)
//      GroupPlayerStats.find({ groupId }).populate("playerId", "name photoUrl")
//      → Single query, hits the { groupId: 1 } index.
//      OLD approach: Group.findById → Player.find({ _id: $in playerPool }) = 2 queries
//
//   2. "Get stats for a specific player in a specific group" (PlayerDetailPage)
//      GroupPlayerStats.findOne({ playerId, groupId })
//      → Hits the unique compound index { playerId, groupId }
//
//   3. "Apply stats after match completion"
//      GroupPlayerStats.bulkWrite([...upserts])
//      → One round-trip to update all players in a match
//
// ─────────────────────────────────────────────────────────────────────────────

const groupPlayerStatsSchema = new mongoose.Schema(
  {
    playerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Player",
      required: true,
    },
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      required: true,
    },

    batting: {
      matches:      { type: Number, default: 0 },
      innings:      { type: Number, default: 0 },
      runs:         { type: Number, default: 0 },
      balls:        { type: Number, default: 0 },
      fours:        { type: Number, default: 0 },
      sixes:        { type: Number, default: 0 },
      thirties:     { type: Number, default: 0 },
      fifties:      { type: Number, default: 0 },
      hundreds:     { type: Number, default: 0 },
      notOuts:      { type: Number, default: 0 },
      highestScore: { type: Number, default: 0 },
    },

    bowling: {
      matches:            { type: Number, default: 0 },
      innings:            { type: Number, default: 0 },
      overs:              { type: Number, default: 0 },
      balls:              { type: Number, default: 0 },
      runs:               { type: Number, default: 0 },
      wickets:            { type: Number, default: 0 },
      threeWickets:       { type: Number, default: 0 },
      fourWickets:        { type: Number, default: 0 },
      fiveWickets:        { type: Number, default: 0 },
      bestFiguresWickets: { type: Number, default: 0 },
      bestFiguresRuns:    { type: Number, default: 0 },
    },
  },
  { timestamps: true },
);

// ─── Indexes ────────────────────────────────────────────────────────────────

// Primary lookup: find one player's stats in one group
groupPlayerStatsSchema.index({ playerId: 1, groupId: 1 }, { unique: true });

// Primary list query: find ALL players' stats in a group
groupPlayerStatsSchema.index({ groupId: 1 });

module.exports = mongoose.model("GroupPlayerStats", groupPlayerStatsSchema);