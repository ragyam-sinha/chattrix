import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { fetchContacts, openChat } from '../../services/api';
import useAuthStore from '../../store/useAuthStore';
import Avatar from '../common/Avatar';
import { useState } from 'react';

export default function ContactsTab() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [loadingId, setLoadingId] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['connections', 'accepted'],
    queryFn: fetchContacts,
    refetchInterval: 15000,
  });

  const handleOpenChat = async (connectionId) => {
    setLoadingId(connectionId);
    try {
      const result = await openChat(connectionId);
      queryClient.invalidateQueries({ queryKey: ['chats'] });
      navigate(`/app/chat/${result.conversation._id}`);
    } catch (err) {
      console.error('Open chat error:', err);
    } finally {
      setLoadingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="loading-center">
        <div className="spinner" />
      </div>
    );
  }

  const contacts = data?.connections || [];

  if (contacts.length === 0) {
    return (
      <div className="empty-state">
        <h3>No contacts yet</h3>
        <p>Accept connection requests or search for a Chatrix ID to connect with people</p>
      </div>
    );
  }

  return (
    <div>
      {contacts.map((conn) => {
        const other =
          conn.requesterId?._id === user._id ? conn.recipientId : conn.requesterId;
        if (!other) return null;

        return (
          <div
            key={conn._id}
            className="chat-list-item"
            onClick={() => handleOpenChat(conn._id)}
            style={{ cursor: loadingId === conn._id ? 'wait' : 'pointer' }}
          >
            <Avatar src={other.avatar} name={other.displayName} />
            <div className="chat-list-info">
              <h4>{other.displayName || other.chatrixId}</h4>
              <p style={{ fontSize: '12px' }}>{other.chatrixId}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
