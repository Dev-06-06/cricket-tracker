const mongoose = require('mongoose');

const matchSchema = new mongoose.Schema(
  {
    battingTeam: {
      type: String,
      required: true
    },
    bowlingTeam: {
      type: String,
      required: true
    },
    totalRuns: {
      type: Number,
      default: 0
    },
    wickets: {
      type: Number,
      default: 0
    },
    oversBowled: {
      type: Number,
      default: 0
    },
    ballsBowled: {
      type: Number,
      default: 0
    },
    currentStriker: {
      type: String
    },
    currentNonStriker: {
      type: String
    },
    currentBowler: {
      type: String
    },
    timeline: [
      {
        overNumber: {
          type: Number
        },
        ballInOver: {
          type: Number
        },
        runsOffBat: {
          type: Number,
          default: 0
        },
        extraType: {
          type: String,
          enum: ['none', 'wide', 'no-ball', 'bye', 'leg-bye'],
          default: 'none'
        },
        extraRuns: {
          type: Number,
          default: 0
        },
        isWicket: {
          type: Boolean,
          default: false
        },
        wicketType: {
          type: String,
          enum: ['none', 'bowled', 'caught', 'lbw', 'run-out', 'stumped', 'hit-wicket'],
          default: 'none'
        },
        batterDismissed: {
          type: String,
          default: ''
        }
      }
    ]
  },
  { timestamps: true }
);

module.exports = mongoose.model('Match', matchSchema);