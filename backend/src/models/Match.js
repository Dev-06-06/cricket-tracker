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
    team1Name: {
      type: String
    },
    team2Name: {
      type: String
    },
    team1Players: [
      { type: mongoose.Schema.Types.ObjectId, ref: 'Player' }
    ],
    team2Players: [
      { type: mongoose.Schema.Types.ObjectId, ref: 'Player' }
    ],
    totalOvers: {
      type: Number,
      default: 20
    },
    tossWinner: {
      type: String
    },
    tossChoice: {
      type: String
    },
    playerStats: [
      {
        playerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Player' },
        name: { type: String },
        team: { type: String },
        didBat: { type: Boolean, default: false },
        didBowl: { type: Boolean, default: false },
        isOut: { type: Boolean, default: false },
        dismissalType: { type: String, default: '' }
      }
    ],
    status: {
      type: String,
      enum: ['toss', 'innings', 'live', 'completed'],
      default: 'toss'
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
        },
        striker: {
          type: String,
          default: ''
        }
      }
    ]
  },
  { timestamps: true }
);

module.exports = mongoose.model('Match', matchSchema);