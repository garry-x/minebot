import React, { useState } from 'react';

const BotControls = ({ onStartBot, onStopBot, onGetLLMAdvice, onStartAutomatic, botStatus }) => {
  const [buildingConfig, setBuildingConfig] = useState({
    width: 5,
    length: 5,
    height: 3,
    blockType: 'oak_planks'
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

  return (
    <div className="bot-controls">
      <h3>Bot Controls</h3>
      
      <div className="control-group">
        <label>Building Configuration:</label>
        <div>
          <label>Width: </label>
          <input
            type="number"
            value={buildingConfig.width}
            onChange={(e) => setBuildingConfig({...buildingConfig, width: parseInt(e.target.value) || 5})}
            min="1"
          />
        </div>
        <div>
          <label>Length: </label>
          <input
            type="number"
            value={buildingConfig.length}
            onChange={(e) => setBuildingConfig({...buildingConfig, length: parseInt(e.target.value) || 5})}
            min="1"
          />
        </div>
        <div>
          <label>Height: </label>
          <input
            type="number"
            value={buildingConfig.height}
            onChange={(e) => setBuildingConfig({...buildingConfig, height: parseInt(e.target.value) || 3})}
            min="1"
          />
        </div>
        <div>
          <label>Block Type: </label>
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
      </div>
      
      <div className="control-buttons">
        <button 
          onClick={handleStartClick}
          disabled={botStatus.connected}
        >
          {botStatus.connected ? 'Connected' : 'Start Bot'}
        </button>
        <button 
          onClick={handleStopClick}
          disabled={!botStatus.connected}
        >
          {botStatus.connected ? 'Stop Bot' : 'Disconnected'}
        </button>
        <button 
          onClick={handleAdviceClick}
          disabled={!botStatus.connected}
        >
          Get LLM Strategy Advice
        </button>
        <button 
          onClick={handleAutomaticClick}
          disabled={botStatus.connected}
        >
          {botStatus.connected ? 'Automatic Running' : 'Start Automatic'}
        </button>
      </div>
    </div>
  );
};

export default BotControls;