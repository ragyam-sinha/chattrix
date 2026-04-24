import mongoose from 'mongoose';

const conversationSchema = new mongoose.Schema(
  {
    type: { type: String, default: 'direct' },
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    connectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Connection' },
    groupName: { type: String, default: '' },
    groupAvatar: { type: String, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    lastMessageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null },
    lastMessageText: { type: String, default: '' },
    lastMessageAt: { type: Date, default: null },
    unreadCounts: { type: Map, of: Number, default: {} },
  },
  { timestamps: true }
);

conversationSchema.index({ participants: 1 });
conversationSchema.index({ participants: 1, lastMessageAt: -1 });

const Conversation =
  mongoose.models.Conversation || mongoose.model('Conversation', conversationSchema);
export { Conversation };
export default Conversation;
