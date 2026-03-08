const mongoose = require("mongoose");

const INVITE_CODE_LENGTH = 6;
const INVITE_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const generateInviteCode = () => {
  let code = "";

  for (let i = 0; i < INVITE_CODE_LENGTH; i += 1) {
    const idx = Math.floor(Math.random() * INVITE_CODE_CHARS.length);
    code += INVITE_CODE_CHARS[idx];
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
      unique: true,
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
    playerPool: [{ type: mongoose.Schema.Types.ObjectId, ref: "Player" }],
  },
  { timestamps: true },
);

groupSchema.pre("validate", async function ensureInviteCode(next) {
  if (this.inviteCode) {
    return next();
  }

  let nextCode = generateInviteCode();
  let codeExists = await this.constructor.exists({ inviteCode: nextCode });

  while (codeExists) {
    nextCode = generateInviteCode();
    codeExists = await this.constructor.exists({ inviteCode: nextCode });
  }

  this.inviteCode = nextCode;
  return next();
});

module.exports = mongoose.model("Group", groupSchema);
