import API_BASE_URL from '../config';
import React, { useState } from 'react';

const BotStartForm = ({ onClose, onSuccess }) => {
  const [username, setUsername] = useState('');
  const [mode, setMode] = useState('survival');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const validateUsername = (value) => {
    if (!value.trim()) return 'Username is required';
    if (!/^[a-zA-Z0-9_]{3,16}$/.test(value)) return '3-16 characters, letters, numbers, underscores only';
    return '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const validationError = validateUsername(username);
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_BASE_URL}/api/bot/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), mode })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to start bot');

      onSuccess(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3>Start New Bot</h3>
        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-group">
            <label>Username</label>
            <input
              type="text"
              value={username}
              onChange={e => { setUsername(e.target.value); setError(''); }}
              placeholder="Enter bot username"
              autoFocus
            />
            {error && <div className="error-text">{error}</div>}
          </div>
          <div className="form-group">
            <label>Game Mode</label>
            <select value={mode} onChange={e => setMode(e.target.value)}>
              <option value="survival">Survival</option>
              <option value="creative">Creative</option>
              <option value="spectator">Spectator</option>
            </select>
          </div>
          <div className="modal-actions">
            <button type="button" className="cancel-btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="submit-btn" disabled={loading}>
              {loading ? 'Starting...' : 'Start Bot'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default BotStartForm;
