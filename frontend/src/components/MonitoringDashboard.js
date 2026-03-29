import React from 'react';
import PositionMap from './PositionMap';
import ResourceBars from './ResourceBars';
import ActionLog from './ActionLog';
import StatusIndicators from './StatusIndicators';
import ConnectionStatus from './ConnectionStatus';
import './MonitoringDashboard.css';

const MonitoringDashboard = ({ 
  botStatus, 
  position, 
  inventory, 
  logs, 
  llmAdvice,
  health,
  food,
  experience,
  gamemode,
  exploration
}) => {
  return (
    <div className="monitoring-dashboard">
      <div className="monitoring-grid">
        <PositionMap 
          position={position} 
          exploration={exploration} 
        />
        <ResourceBars inventory={inventory} />
        <ActionLog logs={logs} />
        <div className="advice-panel">
          <div className="advice-title">AI Strategy Advice</div>
          <div className="advice-text">{llmAdvice || 'No advice available'}</div>
        </div>
        <StatusIndicators 
          health={health} 
          food={food} 
          experience={experience} 
          gamemode={gamemode} 
        />
        <ConnectionStatus connected={botStatus.connected} />
      </div>
    </div>
  );
};

export default MonitoringDashboard;