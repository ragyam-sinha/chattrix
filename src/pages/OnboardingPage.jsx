import { useState } from 'react';
import useAuthStore from '../store/useAuthStore';
import { updateMe } from '../services/api';

export default function OnboardingPage() {
  const { user, setUser } = useAuthStore();
  const [displayName, setDisplayName] = useState(user?.displayName || user?.name || '');
  const [bio, setBio] = useState('');
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(user?.chatrixId || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!displayName.trim()) return;
    setSaving(true);
    try {
      const { user: updated } = await updateMe({
        displayName: displayName.trim(),
        bio: bio.trim(),
        isOnboarded: true,
      });
      setUser(updated);
    } catch (err) {
      console.error('Onboarding error:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="onboarding-page">
      <div className="onboarding-card">
        <h2>Welcome to Chatrix!</h2>
        <p className="subtitle">Here's your unique Chatrix ID. Share it with friends to connect.</p>

        <div className="chatrix-id-display" onClick={handleCopy} title="Click to copy">
          <div className="label">{copied ? '✓ Copied!' : 'Your Chatrix ID (click to copy)'}</div>
          <div className="id">{user?.chatrixId}</div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Display Name</label>
            <input
              className="input"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your display name"
              maxLength={50}
              required
            />
          </div>

          <div className="form-group">
            <label>Bio (optional)</label>
            <input
              className="input"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell us about yourself"
              maxLength={160}
            />
          </div>

          <div className="form-actions">
            <button className="btn btn-primary" type="submit" disabled={saving || !displayName.trim()}>
              {saving ? 'Saving...' : 'Get Started'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
