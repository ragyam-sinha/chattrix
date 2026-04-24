import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { fetchContacts, openChat, updateContactName } from '../../services/api';
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

  const handleRename = async (e, connId, currentName) => {
    e.stopPropagation();
    const newName = window.prompt("Enter a custom name for this contact:", currentName);
    if (newName !== null) {
      try {
        await updateContactName(connId, newName.trim());
        queryClient.invalidateQueries({ queryKey: ['connections', 'accepted'] });
        queryClient.invalidateQueries({ queryKey: ['chats'] });
      } catch (err) {
        alert("Failed to rename contact");
      }
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
        <p>Accept connection requests or search for a CHATTRIX ID to connect with people</p>
      </div>
    );
  }

  return (
    <div>
      {contacts.map((conn) => {
        const isRequester = conn.requesterId?._id === user._id;
        const other = isRequester ? conn.recipientId : conn.requesterId;
        if (!other) return null;

        const customName = isRequester ? conn.recipientCustomName : conn.requesterCustomName;
        const displayName = customName || other.displayName || other.chatrixId;

        return (
          <div
            key={conn._id}
            className="chat-list-item"
            onClick={() => handleOpenChat(conn._id)}
            style={{ cursor: loadingId === conn._id ? 'wait' : 'pointer', display: 'flex', alignItems: 'center' }}
          >
            <Avatar src={other.avatar} name={displayName} />
            <div className="chat-list-info" style={{ flex: 1 }}>
              <h4 style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{displayName}</span>
              </h4>
              <p style={{ fontSize: '12px' }}>{other.chatrixId}</p>
            </div>
            <button 
              className="btn btn-ghost btn-sm" 
              onClick={(e) => handleRename(e, conn._id, displayName)}
              style={{ fontSize: '10px', padding: '2px 6px' }}
            >
              Rename
            </button>
          </div>
        );
      })}
    </div>
  );
}
