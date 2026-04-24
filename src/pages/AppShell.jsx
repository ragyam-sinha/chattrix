import { useEffect, useMemo } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchChats, fetchNotifications } from '../services/api';
import ChatsTab from '../components/chat/ChatsTab';
import RequestsTab from '../components/connections/RequestsTab';
import ContactsTab from '../components/connections/ContactsTab';
import SearchSection from '../components/search/SearchSection';
import ChatWindow from '../components/chat/ChatWindow';
import ProfileDropdown from '../components/ProfileDropdown';
import ProfileSettings from '../components/ProfileSettings';
import { subscribeToConversation } from '../lib/ably';
import useAuthStore from '../store/useAuthStore';

export default function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  const chatMatch = location.pathname.match(/\/app\/chat\/(.+)/);
  const activeChatId = chatMatch ? chatMatch[1] : null;
  const activeTab = location.pathname.startsWith('/app/requests')
    ? 'requests'
    : location.pathname.startsWith('/app/contacts')
      ? 'contacts'
      : 'chats';

  const { data: chatsData } = useQuery({
    queryKey: ['chats'],
    queryFn: fetchChats,
    staleTime: 15000,
    refetchInterval: false,
  });

  const { data: notifications } = useQuery({
    queryKey: ['notifications'],
    queryFn: fetchNotifications,
    refetchInterval: 10000,
  });

  const conversationIds = useMemo(
    () => (chatsData?.conversations || []).map((conversation) => conversation._id).sort(),
    [chatsData?.conversations]
  );
  const conversationKey = conversationIds.join('|');

  useEffect(() => {
    if (!user?._id || conversationIds.length === 0) return;

    let disposed = false;
    const cleanups = [];

    Promise.all(
      conversationIds.map((conversationId) =>
        subscribeToConversation(conversationId, {
          onNewMessage: ({ message }) => {
            const senderId = message?.senderId?._id || message?.senderId;
            const isFromCurrentUser = senderId === user._id;

            queryClient.invalidateQueries({ queryKey: ['chats'] });
            if (!isFromCurrentUser) {
              queryClient.invalidateQueries({ queryKey: ['notifications'] });
            }
          },
          onMessageDeleted: () => {
            queryClient.invalidateQueries({ queryKey: ['chats'] });
          },
        })
      )
    ).then((unsubscribers) => {
      if (disposed) {
        unsubscribers.forEach((unsubscribe) => unsubscribe?.());
        return;
      }
      cleanups.push(...unsubscribers.filter(Boolean));
    });

    return () => {
      disposed = true;
      cleanups.forEach((unsubscribe) => unsubscribe());
    };
  }, [conversationKey, queryClient, user?._id]);

  const handleTabChange = (tab) => {
    if (tab === 'chats') navigate('/app');
    else navigate(`/app/${tab}`);
  };

  return (
    <div className={`app-layout ${activeChatId ? 'has-chat' : ''}`}>
      <div className="sidebar">
        <div className="sidebar-header">
          <div>
            <h2>CHATTRIX</h2>
            <p className="sidebar-tagline">Level up your conversations</p>
          </div>
          <ProfileDropdown />
        </div>

        <div className="sidebar-search">
          <SearchSection />
        </div>

        <div className="sidebar-nav">
          <button
            className={activeTab === 'chats' ? 'active' : ''}
            onClick={() => handleTabChange('chats')}
          >
            Chats
            {notifications?.totalUnreadMessages > 0 && (
              <span className="badge">{notifications.totalUnreadMessages}</span>
            )}
          </button>
          <button
            className={activeTab === 'requests' ? 'active' : ''}
            onClick={() => handleTabChange('requests')}
          >
            Requests
            {notifications?.pendingRequestCount > 0 && (
              <span className="badge">{notifications.pendingRequestCount}</span>
            )}
          </button>
          <button
            className={activeTab === 'contacts' ? 'active' : ''}
            onClick={() => handleTabChange('contacts')}
          >
            Contacts
          </button>
        </div>

        <div className="sidebar-body">
          {activeTab === 'chats' && <ChatsTab activeChatId={activeChatId} />}
          {activeTab === 'requests' && <RequestsTab />}
          {activeTab === 'contacts' && <ContactsTab />}
        </div>
      </div>

      <div className="main-panel">
        <Routes>
          <Route path="settings" element={<ProfileSettings />} />
          <Route path="chat/:conversationId" element={<ChatWindow />} />
          <Route
            path="*"
            element={
              <div className="empty-state" style={{ height: '100%' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                </svg>
                <h3>Welcome to CHATTRIX Arena</h3>
                <p>
                  Fast chats, smart connections, voice calls, and a gamified social vibe.
                  Pick any conversation and dive in.
                </p>
                <div className="feature-pills">
                  <span>Realtime Messages</span>
                  <span>Read Receipts</span>
                  <span>Voice Call</span>
                </div>
              </div>
            }
          />
        </Routes>
      </div>
    </div>
  );
}
