import React, { useState, useEffect, useRef } from 'react';
import API_BASE_URL from '../config';
import BotControls from './BotControls';
import MonitoringDashboard from './MonitoringDashboard';
import VideoPlayer from './VideoPlayer/VideoPlayer';
import './Dashboard.css';

const Dashboard = () => {
  const [botStatus, setBotStatus] = useState({ connected: false, message: 'Not connected' });
  const [currentBotId, setCurrentBotId] = useState(null);
  const [bots, setBots] = useState([]);
  const [logs, setLogs] = useState([]);
  const [position, setPosition] = useState({ x: 0, y: 0, z: 0 });
  const [inventory, setInventory] = useState([]);
  const [llmAdvice, setLlmAdvice] = useState('');
  const [health, setHealth] = useState(20);
  const [food, setFood] = useState(20);
  const [experience, setExperience] = useState(0);
  const [gamemode, setGamemode] = useState('survival');
  const [exploration, setExploration] = useState(0);
  const wsRef = useRef(null);

  useEffect(() => {
    // Connect to the bot server dynamically
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    const connectWebSocket = () => {
      wsRef.current = new WebSocket(wsUrl);
      
      wsRef.current.onopen = () => {
        console.log('WebSocket connected to bot server');
        wsRef.current.send(JSON.stringify({ type: 'register_bot', data: { botId: 'dashboard' } }));
        wsRef.current.send(JSON.stringify({ type: 'get_status' }));
      };
      
      wsRef.current.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'bots_list') {
            setBots(message.data.bots || []);
            if (message.data.bots && message.data.bots.length > 0 && !currentBotId) {
              setCurrentBotId(message.data.bots[0].botId);
            }
          } else if (message.type === 'status_update' || message.type === 'status_list') {
            const bots = message.data.bots || [];
            if (bots.length > 0) {
              const botData = bots[0];
              setBotStatus({ connected: botData.connected, message: botData.message || 'Connected' });
              if (botData.position) {
                setPosition(botData.position);
              }
              if (botData.health !== undefined) {
                setHealth(botData.health);
              }
              if (botData.food !== undefined) {
                setFood(botData.food);
              }
              if (botData.experience !== undefined) {
                // Experience can be a number or an object with level/points/progress
                const expValue = typeof botData.experience === 'object' 
                  ? botData.experience.points || botData.experience.level || 0 
                  : botData.experience;
                setExperience(expValue);
              }
              if (botData.gamemode !== undefined) {
                setGamemode(botData.gamemode);
              }
              if (botData.exploration !== undefined) {
                // Exploration can be a number or an object
                const expValue = typeof botData.exploration === 'object' 
                  ? botData.exploration.points || botData.exploration.progress || 0 
                  : botData.exploration;
                setExploration(parseFloat(expValue) || 0);
              }
            }
          } else if (message.type === 'command_ack') {
            setLogs(prev => [...prev, { 
              text: message.data.message, 
              timestamp: new Date().toLocaleTimeString(),
              type: 'success'
            }]);
          } else if (message.type === 'error') {
            setLogs(prev => [...prev, { 
              text: message.data.message, 
              timestamp: new Date().toLocaleTimeString(),
              type: 'error'
            }]);
          }
        } catch (err) {
          console.error('Error parsing WebSocket message:', err);
        }
      };
      
      wsRef.current.onclose = () => {
        console.log('WebSocket disconnected, reconnecting in 3s...');
        setTimeout(connectWebSocket, 3000);
      };
      
      wsRef.current.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
    };
    
    connectWebSocket();
    
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const handleStartBot = async () => {
    try {
      setLogs(prev => [...prev, { 
        text: `Starting bot...`, 
        timestamp: new Date().toLocaleTimeString(),
        type: 'info'
      }]);
      
      const response = await fetch(`${API_BASE_URL}/api/bot/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'player' })
      });
      
      const data = await response.json();
      
      if (!response.ok) throw new Error(data.error || 'Failed to start bot');
      
      setCurrentBotId(data.botId);
      setBotStatus({ connected: true, message: data.message });
      
      setLogs(prev => [...prev, { 
        text: `Bot started successfully with ID: ${data.botId}`, 
        timestamp: new Date().toLocaleTimeString(),
        type: 'success'
      }]);
    } catch (error) {
      setLogs(prev => [...prev, { 
        text: `Error starting bot: ${error.message}`, 
        timestamp: new Date().toLocaleTimeString(),
        type: 'error'
      }]);
    }
  };

  const handleStopBot = async () => {
    if (!currentBotId) {
      setLogs(prev => [...prev, { 
        text: 'No bot to stop', 
        timestamp: new Date().toLocaleTimeString(),
        type: 'warning'
      }]);
      return;
    }
    
    try {
      setLogs(prev => [...prev, { 
        text: 'Stopping bot...', 
        timestamp: new Date().toLocaleTimeString(),
        type: 'info'
      }]);
      
      const response = await fetch(`${API_BASE_URL}/api/bot/${currentBotId}/stop`, {
        method: 'POST'
      });
      
      const data = await response.json();
      
      if (!response.ok) throw new Error(data.error || 'Failed to stop bot');
      
      setCurrentBotId(null);
      setBotStatus({ connected: false, message: 'Disconnected' });
      
      setLogs(prev => [...prev, { 
        text: 'Bot stopped successfully', 
        timestamp: new Date().toLocaleTimeString(),
        type: 'success'
      }]);
    } catch (error) {
      setLogs(prev => [...prev, { 
        text: `Error stopping bot: ${error.message}`, 
        timestamp: new Date().toLocaleTimeString(),
        type: 'error'
      }]);
    }
  };

  const handleGetLLMAdvice = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/llm/strategy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: `Bot at position (${position.x}, ${position.y}, ${position.z}) with ${inventory.length} items`,
          goal: 'Build a shelter and gather resources',
          current_state: { position, inventory, health, food, experience, gamemode }
        })
      });
      
      if (!response.ok) throw new Error('Failed to get LLM advice');
      
      const data = await response.json();
      // Advice would come via WebSocket in real implementation
      // For demo, we'll update state directly
      setLlmAdvice(data.advice);
    } catch (error) {
      setLogs(prev => [...prev, { 
        text: `Error getting LLM advice: ${error.message}`, 
        timestamp: new Date().toLocaleTimeString(),
        type: 'error'
      }]);
    }
  };

  const handleStartAutomatic = async () => {
    try {
      setLogs(prev => [...prev, { 
        text: `Starting automatic behavior...`, 
        timestamp: new Date().toLocaleTimeString(),
        type: 'info'
      }]);
      
      const response = await fetch(`${API_BASE_URL}/api/bot/automatic`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'player',
          mode: 'survival'
        })
      });
      
      const data = await response.json();
      
      if (!response.ok) throw new Error(data.error || 'Failed to start automatic behavior');
      
      setCurrentBotId(data.botId);
      setBotStatus({ connected: true, message: data.message });
      
      setLogs(prev => [...prev, { 
        text: `Automatic behavior started: ${data.message}`, 
        timestamp: new Date().toLocaleTimeString(),
        type: 'success'
      }]);
    } catch (error) {
      setLogs(prev => [...prev, { 
        text: `Error starting automatic behavior: ${error.message}`, 
        timestamp: new Date().toLocaleTimeString(),
        type: 'error'
      }]);
    }
  };

  const handleGather = async (config) => {
    if (!currentBotId) {
      setLogs(prev => [...prev, { 
        text: 'No bot to gather resources', 
        timestamp: new Date().toLocaleTimeString(),
        type: 'warning'
      }]);
      return;
    }

    try {
      setLogs(prev => [...prev, { 
        text: `Starting gather for bot...`, 
        timestamp: new Date().toLocaleTimeString(),
        type: 'info'
      }]);

      const [blocks, radius] = [config.blocks, config.radius];
      const response = await fetch(`${API_BASE_URL}/api/bot/${currentBotId}/gather`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetBlocks: blocks.split(',').map(b => b.trim()),
          radius: parseInt(radius) || 30
        })
      });

      const data = await response.json();

      if (!response.ok) throw new Error(data.error || 'Failed to start gathering');

      setLogs(prev => [...prev, { 
        text: `Gathering started: ${data.message || 'Success'}`, 
        timestamp: new Date().toLocaleTimeString(),
        type: 'success'
      }]);
    } catch (error) {
      setLogs(prev => [...prev, { 
        text: `Error starting gather: ${error.message}`, 
        timestamp: new Date().toLocaleTimeString(),
        type: 'error'
      }]);
    }
  };

  const handleBuild = async (config) => {
    if (!currentBotId) {
      setLogs(prev => [...prev, { 
        text: 'No bot to build structure', 
        timestamp: new Date().toLocaleTimeString(),
        type: 'warning'
      }]);
      return;
    }

    try {
      setLogs(prev => [...prev, { 
        text: `Starting build for bot...`, 
        timestamp: new Date().toLocaleTimeString(),
        type: 'info'
      }]);

      const [width, length, height, blockType, offset] = [
        config.width, config.length, config.height, config.blockType, config.offset || '0,0,0'
      ];
      const [ox, oy, oz] = offset.split(',').map(n => parseInt(n) || 0);

      const response = await fetch(`${API_BASE_URL}/api/bot/${currentBotId}/build`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          width: parseInt(width) || 5,
          length: parseInt(length) || 5,
          height: parseInt(height) || 3,
          blockType: blockType,
          offsetX: ox,
          offsetY: oy,
          offsetZ: oz
        })
      });

      const data = await response.json();

      if (!response.ok) throw new Error(data.error || 'Failed to start building');

      setLogs(prev => [...prev, { 
        text: `Building started: ${data.message || 'Success'}`, 
        timestamp: new Date().toLocaleTimeString(),
        type: 'success'
      }]);
    } catch (error) {
      setLogs(prev => [...prev, { 
        text: `Error starting build: ${error.message}`, 
        timestamp: new Date().toLocaleTimeString(),
        type: 'error'
      }]);
    }
  };

  const handleRestartBot = async () => {
    if (!currentBotId) {
      setLogs(prev => [...prev, { 
        text: 'No bot to restart', 
        timestamp: new Date().toLocaleTimeString(),
        type: 'warning'
      }]);
      return;
    }

    try {
      setLogs(prev => [...prev, { 
        text: `Restarting bot...`, 
        timestamp: new Date().toLocaleTimeString(),
        type: 'info'
      }]);

      const response = await fetch(`${API_BASE_URL}/api/bot/${currentBotId}/restart`, {
        method: 'POST'
      });

      const data = await response.json();

      if (!response.ok) throw new Error(data.error || 'Failed to restart bot');

      setCurrentBotId(data.botId || currentBotId);
      setBotStatus({ connected: true, message: data.message || 'Bot restarted' });

      setLogs(prev => [...prev, { 
        text: `Bot restarted: ${data.message || 'Success'}`, 
        timestamp: new Date().toLocaleTimeString(),
        type: 'success'
      }]);
    } catch (error) {
      setLogs(prev => [...prev, { 
        text: `Error restarting bot: ${error.message}`, 
        timestamp: new Date().toLocaleTimeString(),
        type: 'error'
      }]);
    }
  };

  const handleRemoveBot = async () => {
    if (!currentBotId) {
      setLogs(prev => [...prev, { 
        text: 'No bot to remove', 
        timestamp: new Date().toLocaleTimeString(),
        type: 'warning'
      }]);
      return;
    }

    try {
      setLogs(prev => [...prev, { 
        text: `Removing bot...`, 
        timestamp: new Date().toLocaleTimeString(),
        type: 'info'
      }]);

      const response = await fetch(`${API_BASE_URL}/api/bot/${currentBotId}`, {
        method: 'DELETE'
      });

      const data = await response.json();

      if (!response.ok) throw new Error(data.error || 'Failed to remove bot');

      setCurrentBotId(null);
      setBotStatus({ connected: false, message: 'Bot removed' });

      setLogs(prev => [...prev, { 
        text: `Bot removed: ${data.message || 'Success'}`, 
        timestamp: new Date().toLocaleTimeString(),
        type: 'success'
      }]);
    } catch (error) {
      setLogs(prev => [...prev, { 
        text: `Error removing bot: ${error.message}`, 
        timestamp: new Date().toLocaleTimeString(),
        type: 'error'
      }]);
    }
  };

  const handleCleanupBots = async () => {
    try {
      setLogs(prev => [...prev, { 
        text: `Cleaning up old bots...`, 
        timestamp: new Date().toLocaleTimeString(),
        type: 'info'
      }]);

      const response = await fetch(`${API_BASE_URL}/api/bot/cleanup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ daysOld: 7 })
      });

      const data = await response.json();

      if (!response.ok) throw new Error(data.error || 'Failed to cleanup bots');

      setLogs(prev => [...prev, { 
        text: `Cleanup completed: ${data.message || 'Success'}`, 
        timestamp: new Date().toLocaleTimeString(),
        type: 'success'
      }]);
    } catch (error) {
      setLogs(prev => [...prev, { 
        text: `Error cleaning up bots: ${error.message}`, 
        timestamp: new Date().toLocaleTimeString(),
        type: 'error'
      }]);
    }
  };

  return (
    <div className="dashboard">
      <div className="header">
        <div className="header-content">
          <button onClick={() => { window.location.hash = 'management'; }} className="back-to-mgmt-btn">
            ← Management
          </button>
          {bots.length > 0 && (
            <select 
              value={currentBotId || ''} 
              onChange={(e) => setCurrentBotId(e.target.value)}
              className="bot-selector"
            >
              <option value="">Select a bot...</option>
              {bots.map(bot => (
                <option key={bot.botId} value={bot.botId}>
                  {bot.username} ({bot.state})
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
      
      <div className="main-content">
        <div className="controls-section">
          <BotControls 
            onStartBot={handleStartBot}
            onStopBot={handleStopBot}
            onGetLLMAdvice={handleGetLLMAdvice}
            onStartAutomatic={handleStartAutomatic}
            onGather={handleGather}
            onBuild={handleBuild}
            onRestartBot={handleRestartBot}
            onRemoveBot={handleRemoveBot}
            onCleanupBots={handleCleanupBots}
            botStatus={botStatus}
          />
        </div>
        
        <div className="monitoring-section">
          <h2 className="section-title">Bot Monitoring Dashboard</h2>
          
          {currentBotId && botStatus.connected && (
            <div className="video-stream-section">
              <h3 className="video-stream-title">Live Bot View</h3>
              <VideoPlayer 
                botId={currentBotId}
                autoConnect={true}
                showStats={true}
                showControls={true}
              />
            </div>
          )}
          
          <MonitoringDashboard 
            botStatus={botStatus}
            position={position}
            inventory={inventory}
            logs={logs}
            llmAdvice={llmAdvice}
            health={health}
            food={food}
            experience={experience}
            gamemode={gamemode}
            exploration={exploration}
          />
        </div>
      </div>
    </div>
  );
};

export default Dashboard;