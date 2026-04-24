import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { searchUser, sendConnectionRequest, acceptConnection, openChat } from '../../services/api';
import { useNavigate } from 'react-router-dom';
import Avatar from '../common/Avatar';

export default function SearchSection() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [searching, setSearching] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [showProfileDetails, setShowProfileDetails] = useState(false);

  const handleSearch = async (e) => {
    e.preventDefault();
    const q = query.trim().toUpperCase();
    if (!q) return;

    setSearching(true);
    setError('');
    setResult(null);
    setShowProfileDetails(false);

    try {
      const data = await searchUser(q);
      setResult(data);
    } catch (err) {
      if (err.response?.status === 404) {
        setError('No user found with this CHATTRIX ID');
      } else {
        setError(err.response?.data?.error || 'Search failed');
      }
    } finally {
      setSearching(false);
    }
  };

  const handleSendRequest = async () => {
    if (!result?.user?._id) return;
    setActionLoading(true);
    try {
      await sendConnectionRequest(result.user._id);
      // Re-search to get updated status
      const data = await searchUser(query.trim().toUpperCase());
      setResult(data);
      queryClient.invalidateQueries({ queryKey: ['connections'] });
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to send request');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAccept = async () => {
    if (!result?.connectionId) return;
    setActionLoading(true);
    try {
      const acceptResult = await acceptConnection(result.connectionId);
      queryClient.invalidateQueries({ queryKey: ['connections'] });
      queryClient.invalidateQueries({ queryKey: ['chats'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      if (acceptResult.conversationId) {
        setResult(null);
        setQuery('');
        navigate(`/app/chat/${acceptResult.conversationId}`);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to accept');
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenChat = async () => {
    if (!result?.connectionId) return;
    setActionLoading(true);
    try {
      const chatResult = await openChat(result.connectionId);
      queryClient.invalidateQueries({ queryKey: ['chats'] });
      setResult(null);
      setQuery('');
      navigate(`/app/chat/${chatResult.conversation._id}`);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to open chat');
    } finally {
      setActionLoading(false);
    }
  };

  const renderActionButton = () => {
    if (!result || result.isSelf) return null;

    const { connectionStatus, isRequester } = result;

    if (connectionStatus === 'accepted') {
      return (
        <button className="btn btn-primary btn-sm" onClick={handleOpenChat} disabled={actionLoading}>
          Chat
        </button>
      );
    }
    if (connectionStatus === 'pending') {
      if (isRequester) {
        return <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Pending</span>;
      }
      return (
        <button className="btn btn-primary btn-sm" onClick={handleAccept} disabled={actionLoading}>
          Accept
        </button>
      );
    }
    // null, rejected (after cooldown), or cancelled
    return (
      <button className="btn btn-primary btn-sm" onClick={handleSendRequest} disabled={actionLoading}>
        Connect
      </button>
    );
  };

  return (
    <div>
      <form onSubmit={handleSearch} style={{ display: 'flex', gap: '8px' }}>
        <input
          className="input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search CHATTRIX ID (CX-XXXX-XXXX)"
          style={{ fontSize: '13px' }}
        />
        <button className="btn btn-primary btn-sm" type="submit" disabled={searching || !query.trim()}>
          {searching ? '...' : '🔍'}
        </button>
      </form>

      {error && (
        <div style={{ padding: '12px', fontSize: '13px', color: 'var(--bg-danger)' }}>{error}</div>
      )}

      {result && (
        <div className="card" style={{ marginTop: '8px' }}>
          <div className="user-card">
            <Avatar src={result.user.avatar} name={result.user.displayName} size="lg" />
            <div className="user-card-info">
              <h3>{result.user.displayName}</h3>
              <div className="chatrix-id">{result.user.chatrixId}</div>
              {showProfileDetails && result.user.bio && <div className="bio">{result.user.bio}</div>}
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setShowProfileDetails((prev) => !prev)}
                style={{ marginTop: '8px', paddingLeft: 0 }}
              >
                {showProfileDetails ? 'Hide Profile' : 'View Profile'}
              </button>
            </div>
            {result.isSelf ? (
              <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>You</span>
            ) : (
              renderActionButton()
            )}
          </div>
        </div>
      )}
    </div>
  );
}
