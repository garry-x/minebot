import React, { useState } from 'react';

const BotControls = ({ onStartBot, onStopBot, onGetLLMAdvice, onStartAutomatic, onGather, onBuild, onRestartBot, onRemoveBot, onCleanupBots, botStatus }) => {
  const [buildingConfig, setBuildingConfig] = useState({
    width: 5,
    length: 5,
    height: 3,
    blockType: 'oak_planks'
  });

  const [gatherConfig, setGatherConfig] = useState({
    blocks: 'oak_log,cobblestone',
    radius: 30
  });

  const handleStartClick = async () => {
    await onStartBot();
  };

  const handleStopClick = async () => {
    await onStopBot();
  };

  const handleAdviceClick = async () => {
    await onGetLLMAdvice();
  };

  const handleAutomaticClick = async () => {
    await onStartAutomatic();
  };

  const handleGatherClick = async () => {
    if (onGather) {
      await onGather(gatherConfig);
    }
  };

  const handleBuildClick = async () => {
    if (onBuild) {
      await onBuild(buildingConfig);
    }
  };

  const handleRestartClick = async () => {
    if (onRestartBot) {
      await onRestartBot();
    }
  };

  const handleRemoveClick = async () => {
    if (onRemoveBot) {
      await onRemoveBot();
    }
  };

  const handleCleanupClick = async () => {
    if (onCleanupBots) {
      await onCleanupBots();
    }
  };

  return (
    <div className="bot-controls">
      <div className="controls-header">
        <h2>Bot Controls</h2>
        <div className="status-indicator">
          <div className={`status-dot ${botStatus.connected ? 'connected' : 'disconnected'}`}></div>
          <span>{botStatus.connected ? 'Connected' : 'Disconnected'}</span>
        </div>
      </div>
      
      <div className="control-group">
        <h3>Building Configuration</h3>
        <div className="config-row">
          <label>Width</label>
          <input
            type="number"
            value={buildingConfig.width}
            onChange={(e) => setBuildingConfig({...buildingConfig, width: parseInt(e.target.value) || 5})}
            min="1"
          />
        </div>
        <div className="config-row">
          <label>Length</label>
          <input
            type="number"
            value={buildingConfig.length}
            onChange={(e) => setBuildingConfig({...buildingConfig, length: parseInt(e.target.value) || 5})}
            min="1"
          />
        </div>
        <div className="config-row">
          <label>Height</label>
          <input
            type="number"
            value={buildingConfig.height}
            onChange={(e) => setBuildingConfig({...buildingConfig, height: parseInt(e.target.value) || 3})}
            min="1"
          />
        </div>
        <div className="config-row">
          <label>Block Type</label>
          <select
            value={buildingConfig.blockType}
            onChange={(e) => setBuildingConfig({...buildingConfig, blockType: e.target.value})}
          >
            <option value="oak_planks">Oak Planks</option>
            <option value="stone">Stone</option>
            <option value="brick">Brick</option>
            <option value="glass">Glass</option>
          </select>
        </div>
        <div className="config-row">
          <label>Offset (x,y,z)</label>
          <input
            type="text"
            value={buildingConfig.offset || '0,0,0'}
            onChange={(e) => setBuildingConfig({...buildingConfig, offset: e.target.value})}
          />
        </div>
        <div className="config-row">
          <div style={{display: 'flex', gap: '8px', alignItems: 'center', width: '100%'}}>
            <div style={{flex: 1}}>
              <button 
                onClick={handleBuildClick}
                disabled={!botStatus.connected}
                className="action-button success"
                style={{width: '100%'}}
              >
                Build Structure
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="control-group">
        <h3>Gathering Configuration</h3>
        <div className="config-row">
          <label>Blocks</label>
          <input
            type="text"
            value={gatherConfig.blocks}
            onChange={(e) => setGatherConfig({...gatherConfig, blocks: e.target.value})}
            placeholder="oak_log,cobblestone"
          />
        </div>
        <div className="config-row">
          <label>Radius</label>
          <input
            type="number"
            value={gatherConfig.radius}
            onChange={(e) => setGatherConfig({...gatherConfig, radius: parseInt(e.target.value) || 30})}
            min="1"
          />
        </div>
        <button 
          onClick={handleGatherClick}
          disabled={!botStatus.connected}
          className="action-button success"
        >
          Start Gathering
        </button>
      </div>

      <div className="control-group">
        <h3>Bot Management</h3>
        <div className="config-row" style={{justifyContent: 'center', gap: '8px'}}>
          <button 
            onClick={handleRestartClick}
            disabled={!botStatus.connected}
            className="action-button warning"
          >
            Restart Bot
          </button>
          <button 
            onClick={handleRemoveClick}
            disabled={!botStatus.connected}
            className="action-button danger"
          >
            Remove Bot
          </button>
          <button 
            onClick={handleCleanupClick}
            disabled={!botStatus.connected}
            className="action-button error"
          >
            Cleanup Bots
          </button>
        </div>
      </div>
      
      <div className="control-actions">
        <button 
          onClick={handleStartClick}
          disabled={botStatus.connected}
          className="action-button primary"
        >
          {botStatus.connected ? 'Connected' : 'Start Bot'}
        </button>
        <button 
          onClick={handleStopClick}
          disabled={!botStatus.connected}
          className="action-button secondary"
        >
          {botStatus.connected ? 'Stop Bot' : 'Disconnected'}
        </button>
        <button 
          onClick={handleAdviceClick}
          disabled={!botStatus.connected}
          className="action-button info"
        >
          Get LLM Strategy Advice
        </button>
        <button 
          onClick={handleAutomaticClick}
          disabled={!botStatus.connected}
          className="action-button warning"
        >
          {botStatus.connected ? 'Automatic Running' : 'Start Automatic'}
        </button>
      </div>
    </div>
  );
};

export default BotControls;