import React, { useState, useEffect, useRef } from 'react';
import BotStartForm from './BotStartForm';

const BotList = ({ onSelectBot, selectedBotId }) => {
  const [bots, setBots] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showStartForm, setShowStartForm] = useState(false);
  const wsRef = useRef(null);

  useEffect(() => {
    fetchBots();
  }, []);

  useEffect(() => {
    const wsUrl = 'ws://localhost:9500';
    wsRef.current = new WebSocket(wsUrl);

    wsRef.current.onopen = () => {
      wsRef.current.send(JSON.stringify({ type: 'register_bot', data: { botId: 'management' } }));
      wsRef.current.send(JSON.stringify({ type: 'get_status' }));
    };

    wsRef.current.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'status_update' || message.type === 'status_list') {
          const wsBots = message.data.bots || [];
          setBots(prevBots => {
            return prevBots.map(bot => {
              const wsBot = wsBots.find(b => b.botId === bot.botId);
              if (wsBot) return { ...bot, ...wsBot, connected: wsBot.connected };
              return bot;
            });
          });
        }
      } catch (err) {
        console.error('Error parsing WS message:', err);
      }
    };

    wsRef.current.onclose = () => {
      setTimeout(() => {
        if (wsRef.current && wsRef.current.readyState !== WebSocket.OPEN) {
          wsRef.current = new WebSocket(wsUrl);
          wsRef.current.onopen = wsRef.current.onmessage = wsRef.current.onclose = function() {};
        }
      }, 3000);
    };

    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(fetchBots, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchBots = async () => {
    try {
      const response = await fetch('http://localhost:9500/api/bots');
      const data = await response.json();
      setBots(data.bots || []);
    } catch (err) {
      console.error('Failed to fetch bots:', err);
    }
  };

  const filteredBots = bots
    .filter(bot => {
      if (searchQuery && !bot.username.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      if (statusFilter === 'alive' && bot.state !== 'ALIVE') return false;
      if (statusFilter === 'dead' && bot.state !== 'DEAD' && bot.state !== 'DISCONNECTED') return false;
      return true;
    });

  const aliveCount = bots.filter(b => b.state === 'ALIVE').length;
  const totalCount = bots.length;

  const handleStartSuccess = () => {
    setShowStartForm(false);
    fetchBots();
  };

  return (
    <div>
      <div className="bot-list-header">
        <h2>Active Bots</h2>
        <button className="start-bot-btn" onClick={() => setShowStartForm(true)}>+ Start Bot</button>
      </div>
      
      <input
        className="search-input"
        placeholder="Search bots..."
        value={searchQuery}
        onChange={e => setSearchQuery(e.target.value)}
      />
      
      <div className="bot-count">{totalCount} bots total · {aliveCount} connected</div>
      
      <div className="filter-tabs">
        <button className={`filter-tab ${statusFilter === 'all' ? 'active' : ''}`} onClick={() => setStatusFilter('all')}>All</button>
        <button className={`filter-tab ${statusFilter === 'alive' ? 'active' : ''}`} onClick={() => setStatusFilter('alive')}>Alive</button>
        <button className={`filter-tab ${statusFilter === 'dead' ? 'active' : ''}`} onClick={() => setStatusFilter('dead')}>Dead</button>
      </div>
      
      {filteredBots.length === 0 ? (
        <div className="empty-state">
          <h3>No bots found</h3>
          <p>Click "+ Start Bot" to start a new bot</p>
        </div>
      ) : (
        filteredBots.map(bot => (
          <div
            key={bot.botId}
            className={`bot-item ${selectedBotId === bot.botId ? 'selected' : ''}`}
            onClick={() => onSelectBot(bot)}
          >
            <div className="bot-item-header">
              <div className="bot-name">
                <div className={`status-dot ${bot.connected ? 'alive' : bot.state === 'DEAD' ? 'dead' : 'disconnected'}`} />
                <strong>{bot.username}</strong>
              </div>
              <span className={`bot-status ${bot.state === 'ALIVE' ? 'alive' : bot.state === 'DEAD' ? 'dead' : 'disconnected'}`}>
                {bot.state}
              </span>
            </div>
            <div className="bot-info">
              {bot.mode || 'survival'} · HP: {bot.health || 0}/{bot.maxHealth || 20}
              {bot.position ? ` · (${bot.position.x}, ${bot.position.y}, ${bot.position.z})` : ''}
              {bot.deadReason ? ` · ${bot.deadReason}` : ''}
            </div>
          </div>
        ))
      )}
      
      {showStartForm && (
        <BotStartForm
          onClose={() => setShowStartForm(false)}
          onSuccess={handleStartSuccess}
        />
      )}
    </div>
  );
};

export default BotList;
