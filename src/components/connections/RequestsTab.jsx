import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchIncomingRequests, fetchOutgoingRequests, acceptConnection, rejectConnection, cancelConnection } from '../../services/api';
import { useNavigate } from 'react-router-dom';
import Avatar from '../common/Avatar';

export default function RequestsTab() {
  const [tab, setTab] = useState('incoming');
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [actionLoading, setActionLoading] = useState(null);

  const { data: incomingData, isLoading: inLoading } = useQuery({
    queryKey: ['connections', 'incoming'],
    queryFn: fetchIncomingRequests,
    refetchInterval: 10000,
  });

  const { data: outgoingData, isLoading: outLoading } = useQuery({
    queryKey: ['connections', 'outgoing'],
    queryFn: fetchOutgoingRequests,
    refetchInterval: 10000,
  });

  const handleAccept = async (id) => {
    setActionLoading(id);
    try {
      const result = await acceptConnection(id);
      queryClient.invalidateQueries({ queryKey: ['connections'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['chats'] });
      // Navigate to the new conversation
      if (result.conversationId) {
        navigate(`/app/chat/${result.conversationId}`);
      }
    } catch (err) {
      console.error('Accept error:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (id) => {
    setActionLoading(id);
    try {
      await rejectConnection(id);
      queryClient.invalidateQueries({ queryKey: ['connections'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    } catch (err) {
      console.error('Reject error:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancel = async (id) => {
    setActionLoading(id);
    try {
      await cancelConnection(id);
      queryClient.invalidateQueries({ queryKey: ['connections'] });
    } catch (err) {
      console.error('Cancel error:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const incoming = incomingData?.connections || [];
  const outgoing = outgoingData?.connections || [];

  return (
    <div>
      <div className="tabs">
        <button className={`tab ${tab === 'incoming' ? 'active' : ''}`} onClick={() => setTab('incoming')}>
          Incoming {incoming.length > 0 && `(${incoming.length})`}
        </button>
        <button className={`tab ${tab === 'outgoing' ? 'active' : ''}`} onClick={() => setTab('outgoing')}>
          Outgoing {outgoing.length > 0 && `(${outgoing.length})`}
        </button>
      </div>

      {tab === 'incoming' && (
        <div>
          {inLoading ? (
            <div className="loading-center"><div className="spinner" /></div>
          ) : incoming.length === 0 ? (
            <div className="empty-state">
              <h3>No incoming requests</h3>
              <p>When someone sends you a connection request, it will appear here</p>
            </div>
          ) : (
            incoming.map((conn) => {
              const user = conn.requesterId;
              return (
                <div key={conn._id} className="request-item">
                  <Avatar src={user?.avatar} name={user?.displayName} />
                  <div className="request-item-info">
                    <h4>{user?.displayName}</h4>
                    <p>{user?.chatrixId}</p>
                  </div>
                  <div className="request-item-actions">
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => handleAccept(conn._id)}
                      disabled={actionLoading === conn._id}
                    >
                      Accept
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleReject(conn._id)}
                      disabled={actionLoading === conn._id}
                    >
                      Reject
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {tab === 'outgoing' && (
        <div>
          {outLoading ? (
            <div className="loading-center"><div className="spinner" /></div>
          ) : outgoing.length === 0 ? (
            <div className="empty-state">
              <h3>No outgoing requests</h3>
              <p>Search for a CHATTRIX ID to send a connection request</p>
            </div>
          ) : (
            outgoing.map((conn) => {
              const user = conn.recipientId;
              return (
                <div key={conn._id} className="request-item">
                  <Avatar src={user?.avatar} name={user?.displayName} />
                  <div className="request-item-info">
                    <h4>{user?.displayName}</h4>
                    <p>{user?.chatrixId}</p>
                  </div>
                  <div className="request-item-actions">
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleCancel(conn._id)}
                      disabled={actionLoading === conn._id}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
