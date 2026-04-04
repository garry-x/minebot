// /data/code/minebot/frontend/src/components/AutonomousDashboard.js
import React, { useState, useEffect, useRef } from 'react';
import './AutonomousDashboard.css';

const AutonomousDashboard = ({ botId, botState }) => {
  const [autonomousState, setAutonomousState] = useState({
    currentAction: '空闲',
    priority: '生存',
    decisionReason: '等待指令',
    threatLevel: '低',
    healthStatus: '安全'
  });
  const [position, setPosition] = useState({ x: 0, y: 0, z: 0 });
  const [lastUpdate, setLastUpdate] = useState(Date.now());
  const wsRef = useRef(null);

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    const connectWebSocket = () => {
      wsRef.current = new WebSocket(wsUrl);
      
      wsRef.current.onopen = () => {
        console.log('AutonomousDashboard WebSocket connected');
        if (botId) {
          wsRef.current.send(JSON.stringify({ 
            type: 'register_bot', 
            data: { botId } 
          }));
        }
      };
      
      wsRef.current.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'status_update') {
            const bots = message.data.bots || [];
            const currentBot = bots.find(b => b.botId === botId);
            if (currentBot) {
              if (currentBot.position) {
                setPosition(currentBot.position);
                setLastUpdate(Date.now());
              }
              
              if (currentBot.autonomousState) {
                setAutonomousState(currentBot.autonomousState);
              }
            }
          }
        } catch (err) {
          console.error('Error parsing WebSocket message:', err);
        }
      };
      
      wsRef.current.onclose = () => {
        console.log('AutonomousDashboard WebSocket disconnected');
        setTimeout(connectWebSocket, 3000);
      };
    };
    
    if (botId) {
      connectWebSocket();
    }
    
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [botId]);

  useEffect(() => {
    const interval = setInterval(() => {
      setLastUpdate(Date.now());
    }, 5000);
    
    return () => clearInterval(interval);
  }, []);

  const getThreatColor = (level) => {
    switch (level) {
      case '高': return '#e74c3c';
      case '中': return '#f39c12';
      case '低': return '#2ecc71';
      default: return '#95a5a6';
    }
  };

  const getHealthColor = (status) => {
    switch (status) {
      case '安全': return '#2ecc71';
      case '警告': return '#f39c12';
      case '危险': return '#e74c3c';
      default: return '#95a5a6';
    }
  };

  const formatPosition = (pos) => {
    return `X: ${pos.x.toFixed(1)}, Y: ${pos.y.toFixed(1)}, Z: ${pos.z.toFixed(1)}`;
  };

  const timeSinceUpdate = () => {
    const seconds = Math.floor((Date.now() - lastUpdate) / 1000);
    if (seconds < 5) return '刚刚';
    if (seconds < 60) return `${seconds}秒前`;
    return `${Math.floor(seconds / 60)}分钟前`;
  };

  return (
    <div className="autonomous-dashboard">
      <div className="dashboard-header">
        <h3>🤖 自主模式控制面板</h3>
        <div className="status-indicator">
          <span className="status-dot active" />
          <span className="status-text">运行中</span>
        </div>
      </div>
      
      <div className="state-grid">
        <div className="state-card">
          <div className="state-label">当前行动</div>
          <div className="state-value action">{autonomousState.currentAction}</div>
        </div>
        
        <div className="state-card">
          <div className="state-label">优先级</div>
          <div className="state-value priority">{autonomousState.priority}</div>
        </div>
        
        <div className="state-card">
          <div className="state-label">威胁等级</div>
          <div 
            className="state-value threat" 
            style={{ color: getThreatColor(autonomousState.threatLevel) }}
          >
            {autonomousState.threatLevel}
          </div>
        </div>
        
        <div className="state-card">
          <div className="state-label">健康状态</div>
          <div 
            className="state-value health-status" 
            style={{ color: getHealthColor(autonomousState.healthStatus) }}
          >
            {autonomousState.healthStatus}
          </div>
        </div>
      </div>
      
      <div className="position-display">
        <div className="position-header">
          <span className="position-label">实时位置</span>
          <span className="position-update">
            <span className="live-dot" /> 更新: {timeSinceUpdate()}
          </span>
        </div>
        <div className="position-coords">
          {formatPosition(position)}
        </div>
        <div className="position-help">
          每5秒自动更新，显示Bot在游戏中的三维坐标
        </div>
      </div>
      
      <div className="decision-reason">
        <div className="reason-label">AI决策原因</div>
        <div className="reason-text">{autonomousState.decisionReason}</div>
      </div>
      
      {botState?.state === 'DEAD' && botState?.deadReason && (
        <div className="death-alert">
          <div className="death-icon">⚰️</div>
          <div className="death-content">
            <div className="death-title">Bot死亡</div>
            <div className="death-reason">{botState.deadReason}</div>
            <div className="death-advice">
              建议：{botState.deadReason.includes('跌落') ? '小心高处' : 
                    botState.deadReason.includes('怪物') ? '准备武器和盔甲' :
                    '提高警惕，注意安全'}
            </div>
          </div>
        </div>
      )}
      
      <div className="emergency-controls">
        <h4>⚡ 紧急控制</h4>
        <div className="emergency-buttons">
          <button className="emergency-btn heal">立即治疗</button>
          <button className="emergency-btn escape">紧急逃跑</button>
          <button className="emergency-btn pause">暂停AI</button>
          <button className="emergency-btn resume">恢复AI</button>
        </div>
      </div>
    </div>
  );
};

export default AutonomousDashboard;
