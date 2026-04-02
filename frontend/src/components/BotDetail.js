import React, { useState } from 'react';

const BotDetail = ({ bot, onBotChange }) => {
  const [actionLoading, setActionLoading] = useState(null);

  if (!bot) {
    return (
      <div className="empty-state">
        <h3>No bot selected</h3>
        <p>Select a bot from the list to view details and manage it</p>
      </div>
    );
  }

  const handleAction = async (action, endpoint, method = 'POST', body = null) => {
    setActionLoading(action);
    try {
      const options = {
        method,
        headers: { 'Content-Type': 'application/json' }
      };
      if (body) options.body = JSON.stringify(body);
      
      const response = await fetch(`http://localhost:9500${endpoint}`, options);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `Failed to ${action}`);
      if (onBotChange) onBotChange();
    } catch (err) {
      console.error(`Action ${action} failed:`, err);
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div>
      <div className="bot-detail-header">
        <div>
          <h2>{bot.username} <span className={`bot-status ${bot.state === 'ALIVE' ? 'alive' : bot.state === 'DEAD' ? 'dead' : 'disconnected'}`} style={{ fontSize: 14, fontWeight: 'normal' }}>● {bot.state.toLowerCase()}</span></h2>
          <div style={{ color: '#64748b', fontSize: 12, marginTop: 4 }}>{bot.botId}</div>
        </div>
        <a
          href={`#dashboard/${bot.botId}`}
          className="open-dashboard-link"
        >
          Open Dashboard →
        </a>
      </div>

      <div className="stat-cards">
        <div className="stat-card">
          <div className="stat-label">Health</div>
          <div className="stat-value health">{bot.health || 0}/{bot.maxHealth || 20}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Food</div>
          <div className="stat-value food">{bot.food || 0}/{bot.maxHealth || 20}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Position</div>
          <div className="stat-value position">
            {bot.position ? `(${bot.position.x}, ${bot.position.y}, ${bot.position.z})` : 'Unknown'}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Mode</div>
          <div className="stat-value mode">{bot.gameMode || bot.mode || 'survival'}</div>
        </div>
      </div>

      <div className="quick-actions">
        <h3>Quick Actions</h3>
        <div className="action-buttons">
          <button
            className="action-btn stop"
            disabled={actionLoading || bot.state !== 'ALIVE'}
            onClick={() => handleAction('stop', `/api/bot/${bot.botId}/stop`)}
          >
            ⏸ Stop
          </button>
          <button
            className="action-btn restart"
            disabled={actionLoading || bot.state === 'ALIVE'}
            onClick={() => handleAction('restart', `/api/bot/${bot.botId}/restart`)}
          >
            🔄 Restart
          </button>
          <button
            className="action-btn remove"
            disabled={actionLoading}
            onClick={() => {
              if (window.confirm(`Are you sure you want to remove ${bot.username}?`)) {
                handleAction('remove', `/api/bot/${bot.botId}`, 'DELETE');
              }
            }}
          >
            🗑️ Remove
          </button>
        </div>
        {actionLoading && <div style={{ color: '#64748b', fontSize: 12, marginTop: 8 }}>{actionLoading} in progress...</div>}
      </div>
    </div>
  );
};

export default BotDetail;
