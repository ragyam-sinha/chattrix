import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { fetchChats } from '../../services/api';
import useAuthStore from '../../store/useAuthStore';
import Avatar from '../common/Avatar';

function formatTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now - d;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export default function ChatsTab({ activeChatId }) {
  const { user } = useAuthStore();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['chats'],
    queryFn: fetchChats,
    refetchInterval: 10000,
  });

  if (isLoading) {
    return (
      <div className="loading-center">
        <div className="spinner" />
      </div>
    );
  }

  const conversations = data?.conversations || [];

  if (conversations.length === 0) {
    return (
      <div className="empty-state">
        <h3>No conversations yet</h3>
        <p>Connect with people using their Chatrix ID to start chatting</p>
      </div>
    );
  }

  return (
    <div>
      {conversations.map((conv) => {
        const other = conv.participants?.find((p) => p._id !== user._id);
        if (!other) return null;

        const isRequester = conv.connectionId?.requesterId === user._id;
        const customName = isRequester ? conv.connectionId?.recipientCustomName : conv.connectionId?.requesterCustomName;
        const displayName = customName || other.displayName || other.chatrixId;

        return (
          <div
            key={conv._id}
            className={`chat-list-item ${conv._id === activeChatId ? 'active' : ''}`}
            onClick={() => navigate(`/app/chat/${conv._id}`)}
          >
            <Avatar src={other.avatar} name={displayName} />
            <div className="chat-list-info">
              <h4>
                {displayName}
                <span className="time">{formatTime(conv.lastMessageAt)}</span>
              </h4>
              <p>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {conv.lastMessageText || 'No messages yet'}
                </span>
                {conv.myUnreadCount > 0 && (
                  <span className="badge" style={{ marginLeft: '8px' }}>{conv.myUnreadCount}</span>
                )}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
