const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
      select: false,
    },
    photoUrl: {
      type: String,
      default: "",
      trim: true,
    },
    // ❌ REMOVED: groups: [ObjectId]
    // Reason: was a redundant bidirectional ref that required 2 writes on
    // join/leave and could go out of sync. Derive group membership from
    // Group.members instead — one source of truth.
  },
  { timestamps: true },
);

// Index already created by unique:true on email above.

userSchema.pre("save", async function hashPassword(next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  return next();
});

userSchema.methods.comparePassword = function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model("User", userSchema);
