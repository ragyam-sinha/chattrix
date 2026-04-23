import { useState, useRef, useEffect } from 'react';
import useAuthStore from '../store/useAuthStore';
import Avatar from './common/Avatar';

export default function ProfileDropdown() {
  const { user, logout } = useAuthStore();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef(null);
  const [copied, setCopied] = useState(false);

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
            {copied ? '✓ Copied Chatrix ID' : 'Copy Chatrix ID'}
          </button>
          <button className="danger" onClick={handleLogout}>
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
}
