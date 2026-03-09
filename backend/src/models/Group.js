const mongoose = require("mongoose");

const INVITE_CODE_LENGTH = 6;
const INVITE_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const generateInviteCode = () => {
  let code = "";
  for (let i = 0; i < INVITE_CODE_LENGTH; i++) {
    code += INVITE_CODE_CHARS[Math.floor(Math.random() * INVITE_CODE_CHARS.length)];
  }
  return code;
};

const groupSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
      trim: true,
    },
    inviteCode: {
      type: String,
      unique: true,       // ← index automatically created
      uppercase: true,
      minlength: INVITE_CODE_LENGTH,
      maxlength: INVITE_CODE_LENGTH,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    members: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        role: {
          type: String,
          enum: ["admin", "member"],
          default: "member",
        },
      },
    ],
    // playerPool stores ObjectId refs to Player documents.
    // Used to quickly find which players belong to this group.
    playerPool: [{ type: mongoose.Schema.Types.ObjectId, ref: "Player" }],
  },
  { timestamps: true },
);

// ─── Indexes ────────────────────────────────────────────────────────────────
// Fast "get my groups" query: Group.find({ "members.user": userId })
groupSchema.index({ "members.user": 1 });

// inviteCode already indexed via unique:true above.

// ─── Auto-generate invite code ──────────────────────────────────────────────
groupSchema.pre("validate", async function (next) {
  if (this.inviteCode) return next();

  let code = generateInviteCode();
  let exists = await this.constructor.exists({ inviteCode: code });
  while (exists) {
    code = generateInviteCode();
    exists = await this.constructor.exists({ inviteCode: code });
  }
  this.inviteCode = code;
  return next();
});

module.exports = mongoose.model("Group", groupSchema);