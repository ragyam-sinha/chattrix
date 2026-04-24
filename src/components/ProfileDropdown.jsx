import { useState, useRef, useEffect } from 'react';
import useAuthStore from '../store/useAuthStore';
import Avatar from './common/Avatar';

export default function ProfileDropdown() {
  const { user, logout } = useAuthStore();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef(null);
  const [copied, setCopied] = useState(false);
  const [theme, setTheme] = useState(document.documentElement.getAttribute('data-theme') || 'dark');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleCopyId = () => {
    navigator.clipboard.writeText(user?.chatrixId || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleLogout = async () => {
    await logout();
    window.location.href = '/login';
  };

  return (
    <div className="profile-menu" ref={dropdownRef}>
      <button
        className="btn btn-ghost"
        onClick={() => setOpen(!open)}
        style={{ padding: '4px' }}
      >
        <Avatar src={user?.avatar} name={user?.displayName} size="sm" />
      </button>

      {open && (
        <div className="profile-dropdown">
          <div className="profile-dropdown-header">
            <h4>{user?.displayName}</h4>
            <p>{user?.chatrixId}</p>
            <div className="email">{user?.email}</div>
          </div>
          <button onClick={handleCopyId}>
            {copied ? '✓ Copied CHATTRIX ID' : 'Copy CHATTRIX ID'}
          </button>
          <button onClick={() => window.location.href = '/app/settings'}>
            Profile Settings
          </button>
          <button onClick={() => alert('Privacy controls are coming soon.')}>
            Privacy & Security
          </button>
          <button onClick={() => alert('Notification preferences are coming soon.')}>
            Notifications
          </button>
          <button onClick={() => alert('Starred messages panel coming soon.')}>
            Starred Messages
          </button>
          <button onClick={() => alert('Archived chats section coming soon.')}>
            Archived Chats
          </button>
          <button onClick={() => alert('Linked devices section coming soon.')}>
            Linked Devices
          </button>
          <button onClick={() => alert('Help & support section coming soon.')}>
            Help
          </button>
          <button onClick={toggleTheme}>
            Toggle Theme ({theme === 'dark' ? 'Light' : 'Dark'})
          </button>
          <button className="danger" onClick={handleLogout}>
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
}
