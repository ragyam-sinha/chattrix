import { useState } from 'react';
import useAuthStore from '../store/useAuthStore';
import { updateMe, deleteMe } from '../services/api';

export default function ProfileSettings() {
  const { user, setUser, logout } = useAuthStore();
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { user: updatedUser } = await updateMe({ displayName, bio });
      setUser(updatedUser);
      alert('Profile updated successfully!');
    } catch (err) {
      console.error(err);
      alert('Failed to update profile.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (window.confirm('Are you SURE you want to delete your account? This will hide your personal info but keep your messages as "Deleted User".')) {
      try {
        await deleteMe();
        await logout();
        window.location.href = '/login';
      } catch (err) {
        console.error(err);
        alert('Failed to delete account.');
      }
    }
  };

  return (
    <div className="profile-page card" style={{ marginTop: '20px' }}>
      <h2>Profile Settings</h2>
      
      <form onSubmit={handleSave}>
        <div className="form-group">
          <label>Display Name</label>
          <input
            className="input"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={50}
          />
        </div>
        
        <div className="form-group">
          <label>Bio</label>
          <textarea
            className="input"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={160}
            rows={3}
          />
        </div>

        <div className="form-actions">
          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving ? 'Saving...' : 'Save Profile'}
          </button>
        </div>
      </form>

      <div style={{ marginTop: '40px', paddingTop: '20px', borderTop: '1px solid var(--border-color)' }}>
        <h3 style={{ color: 'var(--bg-danger)', marginBottom: '10px' }}>Danger Zone</h3>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '15px' }}>
          Deleting your account is permanent. Your personal information will be cleared, and your past messages will be shown as "Deleted User".
        </p>
        <button className="btn btn-danger" onClick={handleDeleteAccount}>
          Delete Account
        </button>
      </div>
    </div>
  );
}
