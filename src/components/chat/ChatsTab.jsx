import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createGroupChat, fetchChats, fetchContacts } from '../../services/api';
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
  const queryClient = useQueryClient();
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [creatingGroup, setCreatingGroup] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['chats'],
    queryFn: fetchChats,
    refetchInterval: 10000,
  });

  const { data: contactsData } = useQuery({
    queryKey: ['connections', 'accepted'],
    queryFn: fetchContacts,
    refetchInterval: 15000,
  });

  const availableMembers = useMemo(() => {
    const contacts = contactsData?.connections || [];
    return contacts
      .map((conn) => {
        const isRequester = conn.requesterId?._id === user._id;
        const other = isRequester ? conn.recipientId : conn.requesterId;
        if (!other) return null;
        return {
          userId: other._id,
          displayName: other.displayName || other.chatrixId,
          chatrixId: other.chatrixId,
          avatar: other.avatar,
        };
      })
      .filter(Boolean);
  }, [contactsData?.connections, user._id]);

  const handleToggleMember = (memberId) => {
    setSelectedMembers((prev) =>
      prev.includes(memberId) ? prev.filter((id) => id !== memberId) : [...prev, memberId]
    );
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim() || selectedMembers.length === 0 || creatingGroup) return;
    setCreatingGroup(true);
    try {
      const { conversation } = await createGroupChat(groupName.trim(), selectedMembers);
      await queryClient.invalidateQueries({ queryKey: ['chats'] });
      setShowGroupModal(false);
      setGroupName('');
      setSelectedMembers([]);
      navigate(`/app/chat/${conversation._id}`);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to create group');
    } finally {
      setCreatingGroup(false);
    }
  };

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
        <p>Connect with people using their CHATTRIX ID to start chatting</p>
      </div>
    );
  }

  return (
    <div>
      <div style={{ padding: '10px 12px' }}>
        <button className="btn btn-secondary btn-sm" onClick={() => setShowGroupModal(true)}>
          + New Group
        </button>
      </div>
      {conversations.map((conv) => {
        const isGroup = conv.type === 'group';
        const other = conv.participants?.find((p) => p._id !== user._id);
        if (!isGroup && !other) return null;

        const isRequester = conv.connectionId?.requesterId === user._id;
        const customName = isRequester ? conv.connectionId?.recipientCustomName : conv.connectionId?.requesterCustomName;
        const displayName = isGroup
          ? conv.groupName || `Group (${conv.participants?.length || 0})`
          : customName || other.displayName || other.chatrixId;
        const subtitle = isGroup
          ? `${conv.participants?.length || 0} members`
          : conv.lastMessageText || 'No messages yet';

        return (
          <div
            key={conv._id}
            className={`chat-list-item ${conv._id === activeChatId ? 'active' : ''}`}
            onClick={() => navigate(`/app/chat/${conv._id}`)}
          >
            <Avatar src={isGroup ? '' : other.avatar} name={displayName} />
            <div className="chat-list-info">
              <h4>
                {displayName}
                <span className="time">{formatTime(conv.lastMessageAt)}</span>
              </h4>
              <p>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {subtitle}
                </span>
                {conv.myUnreadCount > 0 && (
                  <span className="badge" style={{ marginLeft: '8px' }}>{conv.myUnreadCount}</span>
                )}
              </p>
            </div>
          </div>
        );
      })}

      {showGroupModal && (
        <div className="call-modal-backdrop" onClick={() => setShowGroupModal(false)}>
          <div className="call-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Create Group</h3>
            <p>Select members and name your group.</p>
            <div style={{ marginTop: '12px', display: 'grid', gap: '10px' }}>
              <input
                className="input"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="Group name"
                maxLength={80}
              />
              <div style={{ maxHeight: '220px', overflowY: 'auto', border: '1px solid var(--border-soft)', borderRadius: '10px', padding: '8px' }}>
                {availableMembers.length === 0 && (
                  <div style={{ color: 'var(--text-secondary)', fontSize: '12px', padding: '6px' }}>
                    Add contacts first to create a group.
                  </div>
                )}
                {availableMembers.map((member) => (
                  <label key={member.userId} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={selectedMembers.includes(member.userId)}
                      onChange={() => handleToggleMember(member.userId)}
                    />
                    <Avatar src={member.avatar} name={member.displayName} size="sm" />
                    <div style={{ fontSize: '12px' }}>
                      <div>{member.displayName}</div>
                      <div style={{ color: 'var(--text-muted)' }}>{member.chatrixId}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
            <div className="call-modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowGroupModal(false)}>Cancel</button>
              <button
                className="btn btn-primary"
                onClick={handleCreateGroup}
                disabled={!groupName.trim() || selectedMembers.length === 0 || creatingGroup}
              >
                {creatingGroup ? 'Creating...' : 'Create Group'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
