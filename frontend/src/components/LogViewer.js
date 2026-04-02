import React, { useState, useEffect, useRef } from 'react';
import './LogViewer.css';

const LogViewer = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterLevel, setFilterLevel] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(5000);
  const logContainerRef = useRef(null);
  const intervalRef = useRef(null);

  const fetchLogs = async () => {
    try {
      const response = await fetch('http://localhost:9500/api/server/logs');
      const data = await response.json();
      setLogs(data.lines || []);
    } catch (err) {
      console.error('Failed to fetch logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setInterval(() => {
      fetchLogs();
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const filteredLogs = logs.filter(log => {
    if (filterLevel !== 'all' && log.level !== filterLevel) return false;
    if (searchQuery && !log.message.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const formatLogMessage = (message) => {
    if (message.includes('Bot started successfully') || message.includes('Bot stopped successfully')) {
      return <span style={{ color: '#22c55e', fontWeight: 'bold' }}>{message}</span>;
    }
    if (message.includes('Error') || message.includes('Failed')) {
      return <span style={{ color: '#ef4444' }}>{message}</span>;
    }
    if (message.includes('WARN')) {
      return <span style={{ color: '#f59e0b' }}>{message}</span>;
    }
    return message;
  };

  return (
    <div className="log-viewer">
      <div className="log-toolbar">
        <input
          className="log-search-input"
          placeholder="Search logs..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
        <button className={`log-filter-btn ${filterLevel === 'all' ? 'active' : ''}`} onClick={() => setFilterLevel('all')}>All</button>
        <button className={`log-filter-btn ${filterLevel === 'log' ? 'active' : ''}`} onClick={() => setFilterLevel('log')}>Log</button>
        <button className={`log-filter-btn ${filterLevel === 'error' ? 'active' : ''}`} onClick={() => setFilterLevel('error')}>Error</button>
        <button className={`log-filter-btn ${filterLevel === 'warn' ? 'active' : ''}`} onClick={() => setFilterLevel('warn')}>Warn</button>
        
        <select
          value={refreshInterval}
          onChange={e => setRefreshInterval(Number(e.target.value))}
          style={{ background: '#334155', color: '#e2e8f0', border: 'none', padding: '6px 8px', borderRadius: 6, fontSize: 12 }}
        >
          <option value={3000}>3s</option>
          <option value={5000}>5s</option>
          <option value={10000}>10s</option>
          <option value={30000}>30s</option>
        </select>
        
        <button className="log-control-btn" onClick={() => setAutoRefresh(!autoRefresh)}>
          {autoRefresh ? '⏸ Pause' : '▶ Resume'}
        </button>
        <button className="log-control-btn" onClick={() => setAutoScroll(!autoScroll)}>
          {autoScroll ? '📌 Auto-scroll' : '📌 Locked'}
        </button>
        <button className="log-control-btn" onClick={fetchLogs}>🔄 Refresh</button>
        
        <span className="log-stats">{filteredLogs.length} lines</span>
      </div>

      <div className="log-container" ref={logContainerRef}>
        {loading ? (
          <div className="log-empty">Loading logs...</div>
        ) : filteredLogs.length === 0 ? (
          <div className="log-empty">No log entries found</div>
        ) : (
          filteredLogs.map((log, i) => (
            <div key={i} className="log-line">
              <span className="log-timestamp">{log.timestamp || ''}</span>
              <span className={`log-level ${log.level}`}>{log.level}</span>
              <span className="log-message">
                {formatLogMessage(log.message)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default LogViewer;
