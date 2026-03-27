import React, { useState, useEffect } from 'react';

const SimpleLogin = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const storedUsername = localStorage.getItem('botUsername');
    if (storedUsername) {
      setUsername(storedUsername);
    }
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!username.trim()) {
      setError('Please enter a username');
      return;
    }
    
    const validUsername = /^[a-zA-Z0-9_]{3,16}$/.test(username.trim());
    if (!validUsername) {
      setError('Username must be 3-16 characters (letters, numbers, underscores only)');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    setTimeout(() => {
      const cleanUsername = username.trim();
      localStorage.setItem('botUsername', cleanUsername);
      onLogin({ username: cleanUsername });
      setLoading(false);
    }, 500);
  };

  if (loading) {
    return (
      <div className="login-container">
        <div className="loading-card">
          <div className="spinner"></div>
          <p>Connecting...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="login-container">
      <div className="bg-decoration circle-1"></div>
      <div className="bg-decoration circle-2"></div>
      <div className="bg-decoration circle-3"></div>
      
      <div className="login-card">
        <div className="brand-section">
          <div className="logo-container">
            <svg viewBox="0 0 100 100" className="logo-icon">
              <defs>
                <linearGradient id="logoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" style={{stopColor: '#667eea', stopOpacity: 1}} />
                  <stop offset="100%" style={{stopColor: '#764ba2', stopOpacity: 1}} />
                </linearGradient>
              </defs>
              <rect x="10" y="10" width="80" height="80" rx="15" fill="url(#logoGradient)" />
              <rect x="25" y="30" width="20" height="20" fill="white" opacity="0.9" />
              <rect x="55" y="30" width="20" height="20" fill="white" opacity="0.6" />
              <rect x="25" y="55" width="20" height="20" fill="white" opacity="0.6" />
              <rect x="55" y="55" width="20" height="20" fill="white" opacity="0.9" />
            </svg>
          </div>
          <h1 className="brand-title">Minecraft AI</h1>
          <p className="brand-subtitle">Robot Controller</p>
        </div>
        
        <div className="description-section">
          <p>
            Control intelligent Minecraft bots that can build, gather resources, and fly autonomously. 
            Get strategic advice from our integrated LLM service and monitor bot status in real-time.
          </p>
        </div>
        
        <div className="features-section">
          <div className="feature-item">
            <span className="feature-icon">🤖</span>
            <span className="feature-text">AI Powered</span>
          </div>
          <div className="feature-item">
            <span className="feature-icon">⚡</span>
            <span className="feature-text">Real-time</span>
          </div>
          <div className="feature-item">
            <span className="feature-icon">🎮</span>
            <span className="feature-text">Full Control</span>
          </div>
        </div>
        
        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="username" className="form-label">
              Bot Username
            </label>
            <input
              type="text"
              id="username"
              className="form-input"
              placeholder="Enter bot username"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                setError(null);
              }}
              maxLength={16}
              autoFocus
            />
            <p className="form-hint">3-16 characters, letters, numbers, underscores</p>
          </div>
          
          <button 
            type="submit" 
            className="login-btn"
            disabled={loading || !username.trim()}
          >
            <span className="btn-icon">
              <svg viewBox="0 0 24 24" className="minecraft-icon" fill="currentColor">
                <path d="M4 4h4v4H4V4zm6 0h4v4h-4V4zm6 0h4v4h-4V4zM4 10h4v4H4v-4zm6 0h4v4h-4v-4zm6 0h4v4h-4v-4zM4 16h4v4H4v-4zm6 0h4v4h-4v-4zm6 0h4v4h-4v-4z"/>
              </svg>
            </span>
            <span className="btn-text">Start Bot</span>
          </button>
        </form>
        
        {error && (
          <div className="error-section">
            <div className="error-message">
              <span className="error-icon">⚠️</span>
              <span className="error-text">{error}</span>
            </div>
          </div>
        )}
        
        <div className="footer-section">
          <p className="footer-text">
            Server must have online-mode=false in server.properties
          </p>
        </div>
      </div>
    </div>
  );
};

export default SimpleLogin;
