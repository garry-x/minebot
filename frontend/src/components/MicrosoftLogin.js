import React, { useState, useEffect } from 'react';

const MicrosoftLogin = ({ onLogin }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');
    const errorParam = urlParams.get('error');
    
    if (errorParam) {
      setError(`Authentication failed: ${errorParam}`);
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }
    
    if (code && state) {
      setLoading(true);
      fetch('/auth/callback', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      })
      .then(response => response.json())
      .then(data => {
        setLoading(false);
        if (data.success) {
          onLogin({
            username: 'minecraftuser',
            accessToken: data.data.access_token
          });
          window.history.replaceState({}, document.title, window.location.pathname);
        } else {
          setError(data.error || 'Authentication failed');
        }
      })
      .catch(err => {
        setLoading(false);
        setError(`Authentication failed: ${err.message}`);
      });
    }
  }, []);

  const handleMicrosoftLogin = () => {
    setLoading(true);
    setError(null);
    window.location.href = '/auth/microsoft/login';
  };

  if (loading) {
    return (
      <div className="login-container">
        <div className="loading-card">
          <div className="spinner"></div>
          <p>Connecting to Microsoft...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="login-container">
      {/* Background decorations */}
      <div className="bg-decoration circle-1"></div>
      <div className="bg-decoration circle-2"></div>
      <div className="bg-decoration circle-3"></div>
      
      <div className="login-card">
        {/* Logo & Title */}
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
        
        {/* Description */}
        <div className="description-section">
          <p>
            Control intelligent Minecraft bots that can build, gather resources, and fly autonomously. 
            Get strategic advice from our integrated LLM service and monitor bot status in real-time.
          </p>
        </div>
        
        {/* Features */}
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
        
        {/* Login Button */}
        <div className="button-section">
          <button 
            onClick={handleMicrosoftLogin}
            className="microsoft-login-btn"
            disabled={loading}
          >
            <span className="btn-icon">
              <svg viewBox="0 0 21 21" className="microsoft-svg">
                <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
                <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>
                <rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
                <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
              </svg>
            </span>
            <span className="btn-text">Sign in with Microsoft</span>
          </button>
        </div>
        
        {/* Error Message */}
        {error && (
          <div className="error-section">
            <div className="error-message">
              <span className="error-icon">⚠️</span>
              <span className="error-text">{error}</span>
            </div>
          </div>
        )}
        
        {/* Footer */}
        <div className="footer-section">
          <p className="footer-text">
            Secure authentication powered by Microsoft Azure Active Directory
          </p>
        </div>
      </div>
    </div>
  );
};

export default MicrosoftLogin;
