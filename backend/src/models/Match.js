const mongoose = require("mongoose");

// ─── Match ────────────────────────────────────────────────────────────────────
//
// KEY DESIGN DECISIONS vs old model:
//
// 1. team1.players / team2.players embed { name, photoUrl } snapshots
//    → Eliminates .populate("team1Players","name photoUrl") on EVERY query.
//      emitMatchState, listLiveMatches, listCompletedMatches, getMatch all
//      no longer need a populate round-trip.
//
// 2. playerStats includes a full bowling sub-document
//    → Old model only had batting; bowling figures had no typed home.
//
// 3. current{} object groups all live-game state
//    → Cleaner separation between static match info and mutable live state.
//
// 4. innings1{} typed sub-document replaces loose firstInningsScore /
//    firstInningsSummary / targetScore fields.
//
// 5. result{} typed sub-document replaces unstructured result strings.
//
// 6. Indexes on { groupId, status } make all list queries (live/upcoming/
//    completed) hit an index instead of a full collection scan.
//
// ─────────────────────────────────────────────────────────────────────────────

// ── Reusable sub-schemas ────────────────────────────────────────────────────

// Lightweight player snapshot embedded at match-creation time.
// Avoids populate on every read.
const playerSnapshotSchema = new mongoose.Schema(
  {
    playerId: { type: mongoose.Schema.Types.ObjectId, ref: "Player", required: true },
    name:     { type: String, required: true },
    photoUrl: { type: String, default: "" },
  },
  { _id: false },
);

const battingFiguresSchema = new mongoose.Schema(
  {
    runs:  { type: Number, default: 0 },
    balls: { type: Number, default: 0 },
    fours: { type: Number, default: 0 },
    sixes: { type: Number, default: 0 },
    dismissalType: { type: String, default: "" },
  },
  { _id: false },
);

const bowlingFiguresSchema = new mongoose.Schema(
  {
    overs:   { type: Number, default: 0 },
    balls:   { type: Number, default: 0 },  // legal balls only
    runs:    { type: Number, default: 0 },
    wickets: { type: Number, default: 0 },
    wides:   { type: Number, default: 0 },
    noBalls: { type: Number, default: 0 },
  },
  { _id: false },
);

// ── Main schema ─────────────────────────────────────────────────────────────

// JOKER RULE: A joker player has TWO entries in playerStats[] — one per team.
// Both have isJoker: true and the same playerId.
// Innings-end logic must deduplicate by playerId when counting batters.
// skipCareerStats: true on the dissolved/frozen joker entry — only the
// permanent team entry is pushed to GroupPlayerStats.

const matchSchema = new mongoose.Schema(
  {
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      required: true,
    },

    // ── Teams ──────────────────────────────────────────────────────────────
    // Embed name + player snapshots (name, photoUrl) so no populate is needed
    // on any read path. Players are a snapshot at match creation time.
    team1: {
      name:    { type: String, required: true, trim: true },
      players: { type: [playerSnapshotSchema], default: [] },
    },
    team2: {
      name:    { type: String, required: true, trim: true },
      players: { type: [playerSnapshotSchema], default: [] },
    },

    totalOvers: { type: Number, default: 5 },

    status: {
      type: String,
      enum: ["upcoming", "toss", "innings", "live", "innings_complete", "completed"],
      default: "toss",
    },

    // ── Toss ───────────────────────────────────────────────────────────────
    toss: {
      // "team1" | "team2" — avoids string name mismatch bugs
      winner: { type: String, enum: ["team1", "team2", ""], default: "" },
      choice: { type: String, enum: ["bat", "bowl", ""], default: "" },
    },

    // ── Live game state ────────────────────────────────────────────────────
    // Grouped under `current` so it's obvious which fields change ball-by-ball.
    current: {
      inningsNumber: { type: Number, default: 1 },
      battingTeam:   { type: String, enum: ["team1", "team2"], default: "team1" },
      runs:          { type: Number, default: 0 },
      wickets:       { type: Number, default: 0 },
      oversBowled:   { type: Number, default: 0 },
      ballsBowled:   { type: Number, default: 0 }, // legal balls in current over

      // Store both name (for display) and playerId (for lookup) together.
      // Eliminates need to cross-reference playerStats by name string.
      striker: {
        name:     { type: String, default: null },
        playerId: { type: mongoose.Schema.Types.ObjectId, default: null },
      },
      nonStriker: {
        name:     { type: String, default: null },
        playerId: { type: mongoose.Schema.Types.ObjectId, default: null },
      },
      bowler: {
        name:     { type: String, default: null },
        playerId: { type: mongoose.Schema.Types.ObjectId, default: null },
      },
      // "striker" | "nonStriker" | null
      nextBatterFor: { type: String, default: null },
      overBreakPending: { type: Boolean, default: false },
      benchedPlayers: { type: [String], default: [] },
    },

    // ── Innings 1 summary (populated at end of first innings) ─────────────
    innings1: {
      battingTeam: { type: String, enum: ["team1", "team2", ""], default: "" },
      score:       { type: Number, default: null },
      wickets:     { type: Number, default: null },
      overs:       { type: Number, default: null },
      target:      { type: Number, default: null }, // score + 1
      // ✅ Store full batting/bowling rows so statsUpdater can read
      // first innings bowling figures at match completion time.
      // Mixed type allows flexible row shapes without strict sub-schemas.
      battingRows: { type: mongoose.Schema.Types.Mixed, default: [] },
      bowlingRows: { type: mongoose.Schema.Types.Mixed, default: [] },
    },

    // ── Match result (populated on completion) ────────────────────────────
    result: {
      winner:  { type: String, default: "" }, // team name or "Tied"
      message: { type: String, default: "" }, // "Team A won by 5 wickets"
    },

    // ── Per-player in-match stats ─────────────────────────────────────────
    // Written during the match, then applied to GroupPlayerStats on completion.
    playerStats: [
      {
        playerId: { type: mongoose.Schema.Types.ObjectId, ref: "Player" },
        name:     { type: String },
        // "team1" | "team2" — avoids string name comparison
        team:     { type: String, enum: ["team1", "team2"] },

        didBat:  { type: Boolean, default: false },
        didBowl: { type: Boolean, default: false },
        // migration-safe: defaults handle existing documents
        isJoker: { type: Boolean, default: false },
        // migration-safe: defaults handle existing documents
        isBenched: { type: Boolean, default: false },
        // migration-safe: defaults handle existing documents
        skipCareerStats: { type: Boolean, default: false },
        isOut:   { type: Boolean, default: false },

        batting: { type: battingFiguresSchema, default: () => ({}) },
        // ✅ bowling now properly typed (was missing in old model)
        bowling: { type: bowlingFiguresSchema, default: () => ({}) },
      },
    ],

    // ── Ball-by-ball timeline ─────────────────────────────────────────────
    // Kept embedded for simplicity at typical match sizes (≤120 balls for
    // a 10-over match). If you move to 50-over matches, extract to a separate
    // BallEvent collection.
    timeline: [
      {
        overNumber:    { type: Number },
        ballInOver:    { type: Number },
        runsOffBat:    { type: Number, default: 0 },
        extraType:     { type: String, enum: ["none", "wide", "no-ball", "bye", "leg-bye"], default: "none" },
        extraRuns:     { type: Number, default: 0 },
        isWicket:      { type: Boolean, default: false },
        wicketType:    { type: String, enum: ["none", "bowled", "caught", "lbw", "run-out", "stumped", "hit-wicket"], default: "none" },
        batterDismissed: { type: String, default: "" },
        striker:       { type: String, default: "" },
        nonStriker:    { type: String, default: "" }, // ✅ needed for undo strike-rotation replay
        bowler:        { type: String, default: "" },
      },
    ],

    // Guards against double-applying stats to GroupPlayerStats
    statsApplied: { type: Boolean, default: false },
  },
  { timestamps: true },
);

// ─── Indexes ──────────────────────────────────────────────────────────────────

// All list-match queries filter by groupId + status:
//   listLiveMatches:      { groupId, status: $in [...] }
//   listUpcomingMatches:  { groupId, status: "upcoming" }
//   listCompletedMatches: { groupId, status: "completed" }
matchSchema.index({ groupId: 1, status: 1 });

// getOngoingMatch sorts by updatedAt
matchSchema.index({ status: 1, updatedAt: -1 });

module.exports = mongoose.model("Match", matchSchema);