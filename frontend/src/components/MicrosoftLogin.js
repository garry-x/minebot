import React, { useState, useEffect } from 'react';

const MicrosoftLogin = ({ onLogin }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Check for auth callback parameters
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');
    const errorParam = urlParams.get('error');
    
    if (errorParam) {
      setError(`Authentication failed: ${errorParam}`);
      // Clear URL parameters
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }
    
    if (code && state) {
      // Handle callback
      setLoading(true);
      // Send code to backend to complete auth
      fetch('/auth/callback', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      })
      .then(response => response.json())
      .then(data => {
        setLoading(false);
        if (data.success) {
          // Extract user info from token (simplified for demo)
          // In a real app, you'd decode the JWT or get user info from Microsoft Graph
          onLogin({
            username: 'minecraftuser', // Would come from token in real implementation
            accessToken: data.data.access_token // Would be the actual access token
          });
          // Clear URL parameters
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
    // Redirect to Microsoft auth
    window.location.href = '/auth/microsoft/login';
  };

  if (loading) {
    return <div className="microsoft-login">Redirecting to Microsoft...</div>;
  }

  return (
    <div className="microsoft-login-container">
      <h3>Sign in with Microsoft</h3>
      <button 
        onClick={handleMicrosoftLogin}
        className="microsoft-button"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: 8 }}>
          <path d="M12 2.6a9.9 9.9 0 0 0-6.8 3.4c-1.4-.5-2.6-1.2-3.5-2.2l-.7-1c1-.6 1.9-1.3 2.6-2 .9-.8 1.6-1.8 2-2.8l2.4-.4c-.4 1.1-.6 2.3-.6 3.6 0 2.8 1.1 5.3 2.9 7l1.9-1.7c-1.3-.4-2.5-.9-3.5-1.5zm8.9 2.3l-1.3 2.3c.7.4 1.4.7 2.1.9l2.4-.4c-1.2 1.1-2.4 2-3.4 2.6-1 .6-2.1 1-3.1 1-2.3 0-4.2-.9-5.7-2.4l1.6-2.8c1.7.9 3.5 1.6 5.2 2 1.3-.4 2.5-1 3.3-2.1zm-5.7 7.9c-2.2 0-4-.9-5.3-2.3l-2.1 3.7c1.9 1.1 4.1 1.7 6.4 1.7 2.3 0 4.2-.9 5.7-2.4z"/>
        </svg>
        Sign in with Microsoft
      </button>
      {error && <div className="auth-error">{error}</div>}
    </div>
  );
};

export default MicrosoftLogin;