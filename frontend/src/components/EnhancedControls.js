import React, { useState } from 'react';
import API_BASE_URL from '../config';
import './EnhancedControls.css';

const EnhancedControls = ({ botId }) => {
  const [activeTab, setActiveTab] = useState('gather');
  const [loading, setLoading] = useState(false);
  const [gatherConfig, setGatherConfig] = useState({
    preset: 'wood',
    customBlocks: 'oak_log',
    radius: '30'
  });
  const [buildConfig, setBuildConfig] = useState({
    preset: 'house',
    width: '5',
    length: '5',
    height: '3',
    blockType: 'oak_planks',
    offset: '0,0,0'
  });

  const gatherPresets = {
    wood: { name: '🪵 木材', blocks: ['oak_log', 'birch_log'] },
    stone: { name: '🪨 石头', blocks: ['cobblestone', 'stone'] },
    ores: { name: '⛏️ 矿石', blocks: ['coal_ore', 'iron_ore'] },
    food: { name: '🥕 食物', blocks: ['wheat', 'carrot', 'potato'] },
    special: { name: '💎 特殊', blocks: ['diamond_ore', 'gold_ore'] }
  };

  const buildPresets = {
    house: { name: '🏠 房屋', width: 7, length: 7, height: 4, block: 'oak_planks' },
    wall: { name: '🧱 围墙', width: 10, length: 1, height: 3, block: 'cobblestone' },
    tower: { name: '🏰 塔楼', width: 3, length: 3, height: 10, block: 'stone_bricks' },
    farm: { name: '🚜 农场', width: 5, length: 5, height: 1, block: 'farmland' },
    mine: { name: '⛏️ 矿场', width: 8, length: 8, height: 3, block: 'cobblestone' }
  };

  const handleGatherPreset = async (presetKey) => {
    if (!botId || loading) return;
    
    setLoading(true);
    const preset = gatherPresets[presetKey];
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/bot/${botId}/gather`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetBlocks: preset.blocks,
          radius: parseInt(gatherConfig.radius) || 30
        })
      });
      
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      
      alert(`开始采集: ${preset.name}`);
    } catch (err) {
      console.error('Failed to start gathering:', err);
      alert(`采集失败: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCustomGather = async () => {
    if (!botId || loading) return;
    
    setLoading(true);
    const blocks = gatherConfig.customBlocks.split(',').map(b => b.trim()).filter(b => b);
    
    if (blocks.length === 0) {
      alert('请输入要采集的方块类型');
      setLoading(false);
      return;
    }
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/bot/${botId}/gather`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetBlocks: blocks,
          radius: parseInt(gatherConfig.radius) || 30
        })
      });
      
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      
      alert(`开始采集自定义资源: ${blocks.join(', ')}`);
    } catch (err) {
      console.error('Failed to start custom gathering:', err);
      alert(`自定义采集失败: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleBuildPreset = async (presetKey) => {
    if (!botId || loading) return;
    
    setLoading(true);
    const preset = buildPresets[presetKey];
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/bot/${botId}/build`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          width: preset.width,
          length: preset.length,
          height: preset.height,
          blockType: preset.block,
          offsetX: 0,
          offsetY: 0,
          offsetZ: 0
        })
      });
      
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      
      alert(`开始建造: ${preset.name}`);
    } catch (err) {
      console.error('Failed to start building:', err);
      alert(`建造失败: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCustomBuild = async () => {
    if (!botId || loading) return;
    
    setLoading(true);
    const [ox, oy, oz] = buildConfig.offset.split(',').map(n => parseInt(n) || 0);
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/bot/${botId}/build`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          width: parseInt(buildConfig.width) || 5,
          length: parseInt(buildConfig.length) || 5,
          height: parseInt(buildConfig.height) || 3,
          blockType: buildConfig.blockType,
          offsetX: ox,
          offsetY: oy,
          offsetZ: oz
        })
      });
      
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      
      alert('开始自定义建造');
    } catch (err) {
      console.error('Failed to start custom building:', err);
      alert(`自定义建造失败: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="enhanced-controls">
      <div className="controls-header">
        <h3>🚀 增强控制</h3>
        <div className="control-tabs">
          <button 
            className={`tab-btn ${activeTab === 'gather' ? 'active' : ''}`}
            onClick={() => setActiveTab('gather')}
          >
            📦 采集
          </button>
          <button 
            className={`tab-btn ${activeTab === 'build' ? 'active' : ''}`}
            onClick={() => setActiveTab('build')}
          >
            🏗️ 建造
          </button>
        </div>
      </div>
      
      {activeTab === 'gather' && (
        <div className="gather-controls">
          <div className="preset-section">
            <h4>快速采集</h4>
            <div className="preset-buttons">
              {Object.entries(gatherPresets).map(([key, preset]) => (
                <button
                  key={key}
                  className="preset-btn"
                  onClick={() => handleGatherPreset(key)}
                  disabled={loading}
                >
                  {preset.name}
                </button>
              ))}
            </div>
          </div>
          
          <div className="custom-section">
            <h4>自定义采集</h4>
            <div className="custom-form">
              <div className="form-group">
                <label>目标方块:</label>
                <input
                  type="text"
                  value={gatherConfig.customBlocks}
                  onChange={(e) => setGatherConfig({...gatherConfig, customBlocks: e.target.value})}
                  placeholder="例如: oak_log, birch_log, coal_ore"
                />
              </div>
              <div className="form-group">
                <label>采集半径:</label>
                <input
                  type="number"
                  value={gatherConfig.radius}
                  onChange={(e) => setGatherConfig({...gatherConfig, radius: e.target.value})}
                  min="10"
                  max="100"
                />
                <span className="unit">格</span>
              </div>
              <button
                className="action-btn"
                onClick={handleCustomGather}
                disabled={loading}
              >
                {loading ? '采集中...' : '开始采集'}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {activeTab === 'build' && (
        <div className="build-controls">
          <div className="preset-section">
            <h4>快速建造</h4>
            <div className="preset-buttons">
              {Object.entries(buildPresets).map(([key, preset]) => (
                <button
                  key={key}
                  className="preset-btn build"
                  onClick={() => handleBuildPreset(key)}
                  disabled={loading}
                >
                  {preset.name}
                </button>
              ))}
            </div>
          </div>
          
          <div className="custom-section">
            <h4>自定义建造</h4>
            <div className="custom-form">
              <div className="form-row">
                <div className="form-group">
                  <label>宽度:</label>
                  <input
                    type="number"
                    value={buildConfig.width}
                    onChange={(e) => setBuildConfig({...buildConfig, width: e.target.value})}
                    min="1"
                    max="50"
                  />
                </div>
                <div className="form-group">
                  <label>长度:</label>
                  <input
                    type="number"
                    value={buildConfig.length}
                    onChange={(e) => setBuildConfig({...buildConfig, length: e.target.value})}
                    min="1"
                    max="50"
                  />
                </div>
                <div className="form-group">
                  <label>高度:</label>
                  <input
                    type="number"
                    value={buildConfig.height}
                    onChange={(e) => setBuildConfig({...buildConfig, height: e.target.value})}
                    min="1"
                    max="50"
                  />
                </div>
              </div>
              
              <div className="form-group">
                <label>方块类型:</label>
                <input
                  type="text"
                  value={buildConfig.blockType}
                  onChange={(e) => setBuildConfig({...buildConfig, blockType: e.target.value})}
                  placeholder="例如: oak_planks, cobblestone"
                />
              </div>
              
              <div className="form-group">
                <label>偏移量 (X,Y,Z):</label>
                <input
                  type="text"
                  value={buildConfig.offset}
                  onChange={(e) => setBuildConfig({...buildConfig, offset: e.target.value})}
                  placeholder="例如: 0,0,0"
                />
              </div>
              
              <button
                className="action-btn"
                onClick={handleCustomBuild}
                disabled={loading}
              >
                {loading ? '建造中...' : '开始建造'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EnhancedControls;
