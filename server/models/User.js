import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    googleId: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    avatar: { type: String, default: '' },
    chatrixId: { type: String, required: true, unique: true },
    displayName: { type: String, default: '' },
    bio: { type: String, default: '', maxlength: 160 },
    statusMessage: { type: String, default: '', maxlength: 80 },
    isOnboarded: { type: Boolean, default: false },
    lastSeen: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

userSchema.index({ chatrixId: 1 }, { unique: true });
userSchema.index({ googleId: 1 }, { unique: true });
userSchema.index({ email: 1 }, { unique: true });

const User = mongoose.models.User || mongoose.model('User', userSchema);
export default User;
