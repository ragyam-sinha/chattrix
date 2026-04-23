import mongoose from 'mongoose';

const connectionSchema = new mongoose.Schema(
  {
    requesterId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    recipientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'rejected', 'cancelled'],
      default: 'pending',
    },
    actionBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    acceptedAt: { type: Date },
  },
  { timestamps: true }
);

connectionSchema.index({ requesterId: 1, recipientId: 1 }, { unique: true });
connectionSchema.index({ recipientId: 1, status: 1 });
connectionSchema.index({ requesterId: 1, status: 1 });

const Connection = mongoose.models.Connection || mongoose.model('Connection', connectionSchema);
export { Connection };
export default Connection;
