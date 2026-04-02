import React, { useState, useEffect, useRef } from 'react';
import BotControls from './BotControls';
import MonitoringDashboard from './MonitoringDashboard';
import './Dashboard.css';

const Dashboard = ({ user, onLogout }) => {
  const [botStatus, setBotStatus] = useState({ connected: false, message: 'Not connected' });
  const [currentBotId, setCurrentBotId] = useState(null);
  const [logs, setLogs] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [position, setPosition] = useState({ x: 0, y: 0, z: 0 });
  const [llmAdvice, setLlmAdvice] = useState('');
  const [health, setHealth] = useState(20);
  const [food, setFood] = useState(20);
  const [experience, setExperience] = useState(0);
  const [gamemode, setGamemode] = useState('survival');
  const [exploration, setExploration] = useState(0);
  const wsRef = useRef(null);

  useEffect(() => {
    // Connect to the bot server on port 9500
    const wsUrl = `ws://localhost:9500`;
    
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
          if (message.type === 'status_update' || message.type === 'status_list') {
            const bots = message.data.bots || [];
            if (bots.length > 0) {
              const botData = bots[0];
              setBotStatus({ connected: botData.connected, message: botData.message || 'Connected' });
              if (botData.position) {
                setPosition(botData.position);
              }
              if (botData.inventory) {
                setInventory(botData.inventory);
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
        text: `Starting bot: ${user.username}...`, 
        timestamp: new Date().toLocaleTimeString(),
        type: 'info'
      }]);
      
      const response = await fetch('http://localhost:9500/api/bot/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user.username })
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
      
      const response = await fetch(`http://localhost:9500/api/bot/${currentBotId}/stop`, {
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
      const response = await fetch('http://localhost:9500/api/llm/strategy', {
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
        text: `Starting automatic behavior for ${user.username}...`, 
        timestamp: new Date().toLocaleTimeString(),
        type: 'info'
      }]);
      
      const response = await fetch('http://localhost:9500/api/bot/automatic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: user.username,
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
      const response = await fetch(`http://localhost:9500/api/bot/${currentBotId}/gather`, {
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

      const response = await fetch(`http://localhost:9500/api/bot/${currentBotId}/build`, {
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

      const response = await fetch(`http://localhost:9500/api/bot/${currentBotId}/restart`, {
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

      const response = await fetch(`http://localhost:9500/api/bot/${currentBotId}`, {
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

      const response = await fetch('http://localhost:9500/api/bot/cleanup', {
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
          <h1>Minecraft AI Robot Controller</h1>
          <div className="user-info">
            <span className="username">{user.username}</span>
            <span className="role">{user.role || 'Player'}</span>
            <button onClick={onLogout} className="logout-btn">
              Logout
            </button>
          </div>
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