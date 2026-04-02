import React, { useState, useEffect } from 'react';
import API_BASE_URL from '../config';
import ConfigEditModal from './ConfigEditModal';

const CONFIG_CATEGORIES = {
  'Bot Server': [
    { key: 'HOST', label: 'HOST', source: '.env / default' },
    { key: 'PORT', label: 'PORT', source: '.env' },
    { key: 'autoReconnectRetries', label: 'Auto-Reconnect Retries', source: 'hardcoded' },
    { key: 'autoReconnectDelay', label: 'Auto-Reconnect Delay (ms)', source: 'hardcoded' },
    { key: 'broadcastInterval', label: 'Broadcast Interval (ms)', source: 'hardcoded' },
    { key: 'serverStateSaveInterval', label: 'State Save Interval (ms)', source: 'hardcoded' },
    { key: 'botStaleCleanupDays', label: 'Stale Bot Cleanup (days)', source: 'hardcoded' },
  ],
  'Minecraft Server': [
    { key: 'MINECRAFT_SERVER_HOST', label: 'MC Server Host', source: '.env' },
    { key: 'MINECRAFT_SERVER_PORT', label: 'MC Server Port', source: '.env' },
    { key: 'minecraftJarPath', label: 'Server JAR Path', source: 'hardcoded' },
    { key: 'minecraftServerDir', label: 'Server Directory', source: 'hardcoded' },
    { key: 'minecraftMaxMemory', label: 'Max Memory', source: 'hardcoded' },
  ],
  'LLM / AI': [
    { key: 'LLM_SERVICE_URL', label: 'LLM Service URL', source: '.env' },
    { key: 'VLLM_URL', label: 'vLLM URL', source: '.env' },
    { key: 'USE_FALLBACK', label: 'Use Fallback', source: '.env' },
  ],
  'Frontend': [
    { key: 'FRONTEND_PORT', label: 'Frontend Port', source: 'frontend/.env' },
  ],
  'CLI & Defaults': [
    { key: 'defaultBuildingWidth', label: 'Default Build Width', source: 'database' },
    { key: 'defaultBuildingLength', label: 'Default Build Length', source: 'database' },
    { key: 'defaultBuildingHeight', label: 'Default Build Height', source: 'database' },
    { key: 'defaultBuildingBlockType', label: 'Default Block Type', source: 'database' },
    { key: 'defaultGatheringRadius', label: 'Default Gather Radius', source: 'database' },
  ]
};

const ConfigPanel = () => {
  const [activeCategory, setActiveCategory] = useState('Bot Server');
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editingKey, setEditingKey] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [editSource, setEditSource] = useState('');
  const [saveMessage, setSaveMessage] = useState('');

  useEffect(() => {
    fetchConfig();
    fetchDefaultValues();
  }, []);

  const fetchConfig = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/server/config`);
      const data = await response.json();
      setConfig(data);
    } catch (err) {
      console.error('Failed to fetch config:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchDefaultValues = () => {
    const defaultConfig = {
      'HOST': process.env.REACT_APP_DEFAULT_HOST || '0.0.0.0',
      'PORT': process.env.REACT_APP_DEFAULT_PORT || '9500',
      'autoReconnectRetries': '3',
      'autoReconnectDelay': '5000',
      'broadcastInterval': '5000',
      'serverStateSaveInterval': '30000',
      'botStaleCleanupDays': '7',
      'MINECRAFT_SERVER_HOST': process.env.REACT_APP_DEFAULT_MC_HOST || 'localhost',
      'MINECRAFT_SERVER_PORT': process.env.REACT_APP_DEFAULT_MC_PORT || '25565',
      'minecraftJarPath': 'server.jar',
      'minecraftServerDir': 'server',
      'minecraftMaxMemory': '4G',
      'LLM_SERVICE_URL': process.env.REACT_APP_DEFAULT_LLM_URL || 'http://localhost:8080',
      'VLLM_URL': process.env.REACT_APP_DEFAULT_VLLM_URL || 'http://localhost:8080',
      'USE_FALLBACK': 'true',
      'FRONTEND_PORT': process.env.REACT_APP_DEFAULT_FRONTEND_PORT || '3000',
      'defaultBuildingWidth': '10',
      'defaultBuildingLength': '10',
      'defaultBuildingHeight': '6',
      'defaultBuildingBlockType': 'stone',
      'defaultGatheringRadius': '30'
    };
    
    const allConfig = { env: {}, defaults: {} };
    Object.keys(CONFIG_CATEGORIES).forEach(category => {
      CONFIG_CATEGORIES[category].forEach(item => {
        const value = defaultConfig[item.key];
        if (value !== undefined) {
          if (item.source.includes('.env')) {
            allConfig.env[item.key] = value;
          } else {
            allConfig.defaults[item.key] = value;
          }
        }
      });
    });
    
    if (!config) {
      setConfig(allConfig);
    }
  };

  const getDisplayValue = (key, source) => {
    if (!config) return '-';
    
    if (source === '.env' || source === '.env / default' || source === 'frontend/.env') {
      return config.env[key] || config.defaults[key] || '-';
    }
    return config.defaults[key] !== undefined ? config.defaults[key] : '-';
  };

  const handleEdit = (key, source) => {
    const value = getDisplayValue(key, source);
    setEditingKey(key);
    setEditValue(String(value));
    setEditSource(source);
  };

  const handleSave = async () => {
    try {
      const isEnv = editSource === '.env' || editSource === '.env / default' || editSource === 'frontend/.env';
      
      if (isEnv) {
        const response = await fetch(`${API_BASE_URL}/api/server/config/env`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: editingKey, value: editValue })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setSaveMessage(data.message);
      } else {
        const category = editingKey.includes('building') ? 'building' : 'gathering';
        const response = await fetch(`${API_BASE_URL}/api/server/config/database`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category, values: { [editingKey]: editValue } })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setSaveMessage(data.message);
      }
      
      setEditingKey(null);
      fetchConfig();
    } catch (err) {
      setSaveMessage(`Error: ${err.message}`);
    }
  };

  if (loading) return <div style={{ color: '#64748b', padding: 24 }}>Loading configuration...</div>;

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {Object.keys(CONFIG_CATEGORIES).map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            style={{
              background: activeCategory === cat ? '#3b82f6' : '#334155',
              color: activeCategory === cat ? '#fff' : '#94a3b8',
              border: 'none',
              padding: '8px 16px',
              borderRadius: 6,
              fontSize: 13,
              cursor: 'pointer',
              fontWeight: activeCategory === cat ? 'bold' : 'normal'
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      {saveMessage && (
        <div style={{
          background: saveMessage.startsWith('Error') ? '#dc262620' : '#22c55e20',
          color: saveMessage.startsWith('Error') ? '#ef4444' : '#22c55e',
          padding: '10px 14px',
          borderRadius: 6,
          marginBottom: 16,
          fontSize: 13
        }}>
          {saveMessage}
          <button onClick={() => setSaveMessage('')} style={{ marginLeft: 12, background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer' }}>×</button>
        </div>
      )}

      <div style={{ background: '#1e293b', borderRadius: 8, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #334155' }}>
              <th style={{ textAlign: 'left', padding: 12, color: '#94a3b8', fontSize: 12, fontWeight: 600 }}>Parameter</th>
              <th style={{ textAlign: 'left', padding: 12, color: '#94a3b8', fontSize: 12, fontWeight: 600 }}>Value</th>
              <th style={{ textAlign: 'left', padding: 12, color: '#94a3b8', fontSize: 12, fontWeight: 600 }}>Source</th>
              <th style={{ textAlign: 'left', padding: 12, color: '#94a3b8', fontSize: 12, fontWeight: 600 }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {CONFIG_CATEGORIES[activeCategory]?.map((item, i) => {
              const value = getDisplayValue(item.key, item.source);
              return (
                <tr key={item.key} style={{ borderBottom: '1px solid #0f172a' }}>
                  <td style={{ padding: 12, color: '#e2e8f0', fontSize: 14 }}>{item.label}</td>
                  <td style={{ padding: 12 }}>
                    <code style={{
                      background: '#0f172a',
                      padding: '4px 8px',
                      borderRadius: 4,
                      fontSize: 13,
                      color: item.source === '.env' || item.source === '.env / default' ? '#22c55e' : '#f59e0b'
                    }}>
                      {String(value)}
                    </code>
                  </td>
                  <td style={{ padding: 12, color: '#64748b', fontSize: 12 }}>{item.source}</td>
                  <td style={{ padding: 12 }}>
                    <button
                      onClick={() => handleEdit(item.key, item.source)}
                      style={{
                        background: '#334155',
                        color: '#e2e8f0',
                        border: 'none',
                        padding: '4px 12px',
                        borderRadius: 4,
                        fontSize: 12,
                        cursor: 'pointer'
                      }}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editingKey && (
        <ConfigEditModal
          configKey={editingKey}
          currentValue={editValue}
          source={editSource}
          onClose={() => setEditingKey(null)}
          onSave={handleSave}
        />
      )}
    </div>
  );
};

export default ConfigPanel;
