import React, { useState, useEffect, useRef } from 'react';
import BotControls from './BotControls';
import StatusDisplay from './StatusDisplay';

const Dashboard = ({ user, onLogout }) => {
  const [botStatus, setBotStatus] = useState({ connected: false, message: 'Not connected' });
  const [logs, setLogs] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [position, setPosition] = useState({ x: 0, y: 0, z: 0 });
  const [llmAdvice, setLlmAdvice] = useState('');
  const [health, setHealth] = useState(20);
  const [food, setFood] = useState(20);
  const [experience, setExperience] = useState(0);
  const [gamemode, setGamemode] = useState('survival');
  const [currentBotId, setCurrentBotId] = useState(null);
  const wsRef = useRef(null);

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    const connectWebSocket = () => {
      wsRef.current = new WebSocket(wsUrl);
      
      wsRef.current.onopen = () => {
        console.log('WebSocket connected');
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
                setExperience(botData.experience);
              }
              if (botData.gamemode !== undefined) {
                setGamemode(botData.gamemode);
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
      
      const response = await fetch('/api/bot/start', {
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
      
      const response = await fetch(`/api/bot/${currentBotId}/stop`, {
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
      const response = await fetch('/api/llm/strategy', {
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
      
      const response = await fetch('/api/bot/automatic', {
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

  return (
    <div className="dashboard">
      <div className="header">
        <h2>Welcome, {user.username}!</h2>
        <div className="user-info">
          <p>Role: {user.role || 'Player'}</p>
        </div>
      </div>
      
      <div className="content">
        <div className="left-panel">
          <BotControls 
            onStartBot={handleStartBot}
            onStopBot={handleStopBot}
            onGetLLMAdvice={handleGetLLMAdvice}
            onStartAutomatic={handleStartAutomatic}
            botStatus={botStatus}
          />
        </div>
        
        <div className="right-panel">
          <StatusDisplay 
            botStatus={botStatus}
            position={position}
            inventory={inventory}
            logs={logs}
            llmAdvice={llmAdvice}
            health={health}
            food={food}
            experience={experience}
            gamemode={gamemode}
          />
        </div>
      </div>
    </div>
  );
};

export default Dashboard;