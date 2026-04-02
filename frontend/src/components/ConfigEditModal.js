import React, { useState } from 'react';

const ConfigEditModal = ({ configKey, currentValue, source, onClose, onSave }) => {
  const [newValue, setNewValue] = useState(currentValue);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const isEnv = source === '.env' || source === '.env / default';

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!newValue.trim()) {
      setError('Value cannot be empty');
      return;
    }

    setLoading(true);
    setError('');

    try {
      if (isEnv) {
        const response = await fetch('http://localhost:9500/api/server/config/env', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: configKey, value: newValue })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to update');
        onSave(configKey, newValue, true);
      } else {
        const category = configKey.includes('building') ? 'building' : configKey.includes('gathering') ? 'gathering' : 'bot_defaults';
        const response = await fetch('http://localhost:9500/api/server/config/database', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category, values: { [configKey]: newValue } })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to update');
        onSave(configKey, newValue, false);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3>Edit {configKey}</h3>
        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-group">
            <label>Current Value</label>
            <div style={{ color: '#22c55e', fontSize: 14, padding: '8px 12px', background: '#0f172a', borderRadius: 6 }}>{currentValue}</div>
          </div>
          <div className="form-group">
            <label>New Value</label>
            <input
              type="text"
              value={newValue}
              onChange={e => { setNewValue(e.target.value); setError(''); }}
              autoFocus
            />
            {error && <div className="error-text">{error}</div>}
          </div>
          {isEnv && (
            <div style={{ color: '#f59e0b', fontSize: 12, marginBottom: 12 }}>
              ⚠️ This change requires a server restart to take effect.
            </div>
          )}
          <div className="modal-actions">
            <button type="button" className="cancel-btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="submit-btn" disabled={loading}>
              {loading ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ConfigEditModal;
