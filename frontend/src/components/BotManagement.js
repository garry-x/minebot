import React, { useState } from 'react';
import BotList from './BotList';
import BotDetail from './BotDetail';
import ConfigPanel from './ConfigPanel';
import LogViewer from './LogViewer';
import './BotManagement.css';

const BotManagement = () => {
  const [activeTab, setActiveTab] = useState('bots');

  return (
    <div className="management-page">
      <header className="management-header">
        <h1>Minecraft AI Robot Manager</h1>
      </header>
      
      <nav className="tab-nav">
        <button className={`tab-btn ${activeTab === 'bots' ? 'active' : ''}`} onClick={() => setActiveTab('bots')}>
          Bots
        </button>
        <button className={`tab-btn ${activeTab === 'config' ? 'active' : ''}`} onClick={() => setActiveTab('config')}>
          Config
        </button>
        <button className={`tab-btn ${activeTab === 'logs' ? 'active' : ''}`} onClick={() => setActiveTab('logs')}>
          Logs
        </button>
      </nav>
      
      <div className="tab-content">
        {activeTab === 'bots' && <BotsTab />}
        {activeTab === 'config' && <ConfigPanel />}
        {activeTab === 'logs' && <LogViewer />}
      </div>
    </div>
  );
};

const BotsTab = () => {
  const [selectedBot, setSelectedBot] = useState(null);

  return (
    <div className="bots-container">
      <div className="bot-list-panel">
        <BotList onSelectBot={setSelectedBot} selectedBotId={selectedBot?.botId} />
      </div>
      <div className="bot-detail-panel">
        <BotDetail bot={selectedBot} onBotChange={() => {}} />
      </div>
    </div>
  );
};

export default BotManagement;
