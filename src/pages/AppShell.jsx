import { useState } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import useAuthStore from '../store/useAuthStore';
import { fetchNotifications } from '../services/api';
import ChatsTab from '../components/chat/ChatsTab';
import RequestsTab from '../components/connections/RequestsTab';
import ContactsTab from '../components/connections/ContactsTab';
import SearchSection from '../components/search/SearchSection';
import ChatWindow from '../components/chat/ChatWindow';
import ProfileDropdown from '../components/ProfileDropdown';

export default function AppShell() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState('chats');

  // Figure out if a chat is open for responsive behavior
  const chatMatch = location.pathname.match(/\/app\/chat\/(.+)/);
  const activeChatId = chatMatch ? chatMatch[1] : null;

  const { data: notifications } = useQuery({
    queryKey: ['notifications'],
    queryFn: fetchNotifications,
    refetchInterval: 10000,
  });

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    if (tab === 'chats') navigate('/app');
    else navigate(`/app/${tab}`);
  };

  return (
    <div className={`app-layout ${activeChatId ? 'has-chat' : ''}`}>
      <div className="sidebar">
        <div className="sidebar-header">
          <h2>Chatrix</h2>
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
          <Route path="chat/:conversationId" element={<ChatWindow />} />
          <Route
            path="*"
            element={
              <div className="empty-state" style={{ height: '100%' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                </svg>
                <h3>Welcome to Chatrix</h3>
                <p>Search for a Chatrix ID, connect with people, and start chatting. Select a conversation to begin.</p>
              </div>
            }
          />
        </Routes>
      </div>
    </div>
  );
}
