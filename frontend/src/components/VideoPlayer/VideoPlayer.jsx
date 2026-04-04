import React, { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import './VideoPlayer.css';

const VideoPlayer = ({ botId, autoConnect = true, showStats = true, showControls = true }) => {
  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [streamStats, setStreamStats] = useState({
    fps: 0,
    viewerCount: 0,
    bandwidth: '0 Mbps',
    quality: 0.7,
    width: 854,
    height: 480
  });
  const [streamUrl, setStreamUrl] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [wsConnected, setWsConnected] = useState(false);
  
  const imgRef = useRef(null);
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 3;

  useEffect(() => {
    if (autoConnect && botId) {
      setupWebSocket();
    }

    return () => {
      stopStream();
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [botId]);

  const setupWebSocket = () => {
    if (wsRef.current) {
      wsRef.current.close();
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    wsRef.current = new WebSocket(wsUrl);
    
    wsRef.current.onopen = () => {
      console.log('WebSocket connected for video streaming');
      setWsConnected(true);
      reconnectAttemptsRef.current = 0;
      if (autoConnect && botId) {
        startStream();
      }
    };
    
    wsRef.current.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        handleWebSocketMessage(message);
      } catch (err) {
        console.error('Error parsing WebSocket message:', err);
      }
    };
    
    wsRef.current.onclose = () => {
      console.log('WebSocket disconnected');
      setWsConnected(false);
      setIsStreaming(false);
      setConnectionStatus('disconnected');
      
      if (reconnectAttemptsRef.current < maxReconnectAttempts) {
        reconnectAttemptsRef.current++;
        reconnectTimeoutRef.current = setTimeout(() => {
          console.log(`Reconnecting WebSocket (attempt ${reconnectAttemptsRef.current}/${maxReconnectAttempts})`);
          setupWebSocket();
        }, 3000);
      }
    };
    
    wsRef.current.onerror = (err) => {
      console.error('WebSocket error:', err);
      setError('WebSocket connection failed');
    };
  };

  const handleWebSocketMessage = (message) => {
    switch (message.type) {
      case 'stream_status':
        if (message.data.botId === botId) {
          setIsStreaming(message.data.isStreaming);
          if (message.data.url && !streamUrl) {
            setStreamUrl(message.data.url);
          }
          if (message.data.viewerCount !== undefined) {
            setStreamStats(prev => ({
              ...prev,
              viewerCount: message.data.viewerCount,
              fps: message.data.fps || prev.fps,
              quality: message.data.quality || prev.quality
            }));
          }
        }
        break;
        
      case 'stream_stats':
        if (message.data.botId === botId && message.data.stats) {
          const stats = message.data.stats;
          if (stats.isRunning) {
            setIsStreaming(true);
            setStreamStats(prev => ({
              ...prev,
              fps: stats.settings?.fps || prev.fps,
              viewerCount: stats.viewerCount || 0,
              bandwidth: stats.bandwidth || prev.bandwidth,
              quality: stats.settings?.quality || prev.quality
            }));
          }
        }
        break;
        
      case 'stream_error':
        if (message.data && message.data.message) {
          setError(message.data.message);
          setIsLoading(false);
        }
        break;
        
      case 'streams_status':
        if (message.data.streams) {
          const botStream = message.data.streams.find(s => s.botId === botId);
          if (botStream) {
            setIsStreaming(botStream.isRunning);
            setStreamStats(prev => ({
              ...prev,
              fps: botStream.settings?.fps || prev.fps,
              viewerCount: botStream.viewerCount || 0,
              bandwidth: botStream.bandwidth || prev.bandwidth
            }));
          } else if (isStreaming) {
            setIsStreaming(false);
          }
        }
        break;
    }
  };

  const sendWebSocketCommand = (action, data = {}) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setError('WebSocket not connected');
      return false;
    }

    try {
      const message = JSON.stringify({
        type: 'stream',
        data: { botId, action, ...data }
      });
      wsRef.current.send(message);
      return true;
    } catch (err) {
      console.error('Error sending WebSocket command:', err);
      setError('Failed to send command');
      return false;
    }
  };

  const startStream = async (options = {}) => {
    if (!botId) {
      setError('Bot ID is required');
      return;
    }

    setIsLoading(true);
    setError(null);
    
    const success = sendWebSocketCommand('start', {
      config: {
        fps: options.fps || 20,
        quality: options.quality || 0.7,
        width: options.width || 854,
        height: options.height || 480
      }
    });
    
    if (!success) {
      setIsLoading(false);
      return;
    }

    const streamUrl = `/api/stream/${botId}/mjpeg`;
    setStreamUrl(streamUrl);
    setConnectionStatus('connecting');
  };

  const stopStream = () => {
    if (!botId) return;
    
    sendWebSocketCommand('stop');
    setIsStreaming(false);
    setStreamUrl(null);
    setConnectionStatus('disconnected');
    setIsLoading(false);
  };

  const configureStream = (config) => {
    if (!botId) return;
    
    sendWebSocketCommand('configure', { config });
  };

  const getStreamStats = () => {
    if (!botId) return;
    
    sendWebSocketCommand('getStats');
  };

  const handleImageError = (e) => {
    console.error('Image loading error:', e);
    if (isStreaming) {
      setConnectionStatus('error');
      setError('Video stream failed to load');
      
      setTimeout(() => {
        if (isStreaming && streamUrl) {
          setConnectionStatus('reconnecting');
          setError(null);
          setStreamUrl(null);
          setTimeout(() => {
            setStreamUrl(`/api/stream/${botId}/mjpeg?t=${Date.now()}`);
          }, 1000);
        }
      }, 2000);
    }
  };

  const handleImageLoad = () => {
    setIsLoading(false);
    setConnectionStatus('connected');
    setError(null);
  };

  const getConnectionStatusText = () => {
    if (error) return error;
    if (!wsConnected) return 'WebSocket disconnected';
    if (isLoading) return 'Connecting...';
    if (connectionStatus === 'connected') return 'Live';
    if (connectionStatus === 'connecting') return 'Connecting...';
    if (connectionStatus === 'reconnecting') return 'Reconnecting...';
    return isStreaming ? 'Connected' : 'Ready to connect';
  };

  const getConnectionStatusClass = () => {
    if (error) return 'error';
    if (!wsConnected) return 'disconnected';
    if (isLoading || connectionStatus === 'connecting' || connectionStatus === 'reconnecting') return 'connecting';
    if (connectionStatus === 'connected') return 'connected';
    return isStreaming ? 'connected' : 'disconnected';
  };

  const handleFullscreen = () => {
    if (imgRef.current) {
      if (imgRef.current.requestFullscreen) {
        imgRef.current.requestFullscreen();
      } else if (imgRef.current.webkitRequestFullscreen) {
        imgRef.current.webkitRequestFullscreen();
      } else if (imgRef.current.mozRequestFullScreen) {
        imgRef.current.mozRequestFullScreen();
      } else if (imgRef.current.msRequestFullscreen) {
        imgRef.current.msRequestFullscreen();
      }
    }
  };

  const handleQualityChange = (quality) => {
    configureStream({ quality });
  };

  const handleFpsChange = (fps) => {
    configureStream({ fps });
  };

  return (
    <div className="video-player">
      <div className="video-player-header">
        <h3>Bot Video Stream</h3>
        <div className={`connection-status ${getConnectionStatusClass()}`}>
          {getConnectionStatusText()}
        </div>
      </div>
      
      <div className="video-container">
        {isStreaming && streamUrl ? (
          <>
            <img
              ref={imgRef}
              src={streamUrl}
              alt={`Bot ${botId} Stream`}
              className="video-stream"
              onLoad={handleImageLoad}
              onError={handleImageError}
              crossOrigin="anonymous"
            />
            {showControls && (
              <div className="video-overlay-controls">
                <button onClick={stopStream} className="control-btn stop-btn">
                  <span className="icon">⏹️</span> Stop
                </button>
                <button onClick={handleFullscreen} className="control-btn fullscreen-btn">
                  <span className="icon">⛶</span> Fullscreen
                </button>
                <button onClick={getStreamStats} className="control-btn stats-btn">
                  <span className="icon">📊</span> Refresh Stats
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="video-placeholder">
            <div className="placeholder-icon">📹</div>
            <p className="placeholder-text">Video Stream</p>
            {!isStreaming && !isLoading && (
              <>
                <p className="placeholder-subtext">Click to start streaming bot's view</p>
                <button 
                  onClick={startStream} 
                  className="start-stream-btn"
                  disabled={isLoading || !wsConnected}
                >
                  {isLoading ? 'Starting...' : 'Start Stream'}
                </button>
              </>
            )}
            {isLoading && (
              <div className="loading-indicator">
                <div className="loading-spinner"></div>
                <p>Connecting to stream...</p>
              </div>
            )}
          </div>
        )}
      </div>
      
      {showStats && (isStreaming || error) && (
        <div className="video-stats">
          <div className="stats-row">
            <div className="stat-item">
              <span className="stat-label">FPS:</span>
              <span className="stat-value">{streamStats.fps}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Viewers:</span>
              <span className="stat-value">{streamStats.viewerCount}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Bandwidth:</span>
              <span className="stat-value">{streamStats.bandwidth}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Quality:</span>
              <span className="stat-value">{Math.round(streamStats.quality * 100)}%</span>
            </div>
          </div>
          
          {showControls && (
            <div className="quality-controls">
              <div className="quality-slider">
                <label htmlFor="quality-slider">Quality: {Math.round(streamStats.quality * 100)}%</label>
                <input
                  id="quality-slider"
                  type="range"
                  min="30"
                  max="95"
                  step="5"
                  value={streamStats.quality * 100}
                  onChange={(e) => handleQualityChange(parseInt(e.target.value) / 100)}
                />
              </div>
              <div className="fps-controls">
                <label>FPS:</label>
                <div className="fps-buttons">
                  {[10, 15, 20, 25, 30].map(fps => (
                    <button
                      key={fps}
                      className={`fps-btn ${streamStats.fps === fps ? 'active' : ''}`}
                      onClick={() => handleFpsChange(fps)}
                    >
                      {fps}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      
      {error && (
        <div className="error-display">
          <p className="error-text">{error}</p>
          <button onClick={() => setError(null)} className="dismiss-error-btn">
            Dismiss
          </button>
          {!isStreaming && (
            <button onClick={startStream} className="retry-btn">
              Retry Connection
            </button>
          )}
        </div>
      )}
      
      {!wsConnected && (
        <div className="ws-warning">
          <p>⚠️ WebSocket disconnected. Video control may be limited.</p>
          <button onClick={setupWebSocket} className="reconnect-btn">
            Reconnect WebSocket
          </button>
        </div>
      )}
    </div>
  );
};

VideoPlayer.propTypes = {
  botId: PropTypes.string.isRequired,
  autoConnect: PropTypes.bool,
  showStats: PropTypes.bool,
  showControls: PropTypes.bool
};

VideoPlayer.defaultProps = {
  autoConnect: true,
  showStats: true,
  showControls: true
};

export default VideoPlayer;
