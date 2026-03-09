const mongoose = require("mongoose");

// ─── Player ──────────────────────────────────────────────────────────────────
// Intentionally lean. Stats are no longer stored here.
//
// WHY: The old model stored a single global batting/bowling object, meaning
// stats from all groups were blended together. You couldn't answer
// "what are this player's stats in Group A vs Group B?"
//
// Stats now live in GroupPlayerStats (one document per player per group),
// indexed for O(1) lookup. This also means getGroupPlayersWithStats drops
// from 2 queries → 1 query.
// ─────────────────────────────────────────────────────────────────────────────

const playerSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    photoUrl: {
      type: String,
      default: "",
      trim: true,
    },
    // Optional link to a registered User account.
    // Null for "guest" players added manually to a group.
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

// ─── Indexes ────────────────────────────────────────────────────────────────
// Fast lookup when linking a User → their Player document
playerSchema.index({ userId: 1 }, { sparse: true });

// Fast duplicate-name check on createPlayer
playerSchema.index({ name: 1 });

module.exports = mongoose.model("Player", playerSchema);
