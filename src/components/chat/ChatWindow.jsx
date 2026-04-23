import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchConversation, fetchMessages, sendMessage, markAsRead } from '../../services/api';
import useAuthStore from '../../store/useAuthStore';
import Avatar from '../common/Avatar';

function formatMessageTime(dateStr) {
  return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDateLabel(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now - d;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
}

export default function ChatWindow() {
  const { conversationId } = useParams();
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);

  // Fetch conversation details
  const { data: convData } = useQuery({
    queryKey: ['conversation', conversationId],
    queryFn: () => fetchConversation(conversationId),
    enabled: !!conversationId,
  });

  // Fetch messages with polling
  const { data: msgData, isLoading: msgLoading } = useQuery({
    queryKey: ['chat', conversationId, 'messages'],
    queryFn: () => fetchMessages(conversationId),
    enabled: !!conversationId,
    refetchInterval: 3000,
    refetchIntervalInBackground: false,
  });

  const conversation = convData?.conversation;
  const messages = msgData?.messages || [];
  const other = conversation?.participants?.find((p) => p._id !== user._id);

  // Mark as read when opening or receiving new messages
  useEffect(() => {
    if (conversationId && messages.length > 0) {
      markAsRead(conversationId).then(() => {
        queryClient.invalidateQueries({ queryKey: ['chats'] });
        queryClient.invalidateQueries({ queryKey: ['notifications'] });
      });
    }
  }, [conversationId, messages.length, queryClient]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSend = async (e) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    setSending(true);
    setText('');
    try {
      await sendMessage(conversationId, trimmed);
      queryClient.invalidateQueries({ queryKey: ['chat', conversationId, 'messages'] });
      queryClient.invalidateQueries({ queryKey: ['chats'] });
    } catch (err) {
      setText(trimmed); // restore on failure
      console.error('Send error:', err);
    } finally {
      setSending(false);
    }
  };

  if (!conversation && !msgLoading) {
    return (
      <div className="empty-state" style={{ height: '100%' }}>
        <h3>Conversation not found</h3>
        <p>This conversation may not exist or you don't have access.</p>
      </div>
    );
  }

  // Group messages by date
  let lastDate = null;

  return (
    <div className="chat-window">
      <div className="chat-header">
        {/* Back button for mobile */}
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => navigate('/app')}
          style={{ display: 'none' }}
          id="chat-back-btn"
        >
          ←
        </button>
        {other && <Avatar src={other.avatar} name={other.displayName} />}
        <div className="chat-header-info">
          <h3>{other?.displayName || 'Loading...'}</h3>
          <p>{other?.chatrixId}</p>
        </div>
      </div>

      <div className="chat-messages" ref={messagesContainerRef}>
        {msgLoading ? (
          <div className="loading-center">
            <div className="spinner" />
          </div>
        ) : messages.length === 0 ? (
          <div className="empty-state">
            <p>No messages yet. Say hello! 👋</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMine = msg.senderId?._id === user._id || msg.senderId === user._id;
            const msgDate = formatDateLabel(msg.createdAt);
            let showDate = false;
            if (msgDate !== lastDate) {
              showDate = true;
              lastDate = msgDate;
            }

            return (
              <div key={msg._id}>
                {showDate && <div className="date-separator">{msgDate}</div>}
                <div className={`message-bubble ${isMine ? 'sent' : 'received'}`}>
                  <div>{msg.text}</div>
                  <div className="message-time">
                    {formatMessageTime(msg.createdAt)}
                    {isMine && msg.readAt && ' ✓✓'}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      <form className="chat-composer" onSubmit={handleSend}>
        <input
          className="input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a message..."
          maxLength={4000}
          disabled={sending}
        />
        <button className="btn btn-primary" type="submit" disabled={!text.trim() || sending}>
          Send
        </button>
      </form>

      {/* Mobile back button style */}
      <style>{`
        @media (max-width: 768px) {
          #chat-back-btn { display: inline-flex !important; }
        }
      `}</style>
    </div>
  );
}
