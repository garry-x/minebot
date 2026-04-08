import React, { useState, useCallback } from 'react';
import { Box, Text, Newline, useInput } from 'ink';
import * as integration from '../integration.mjs';

const StatusBadge = ({ status }) => {
  const config = {
    RUNNING: { color: 'green', symbol: '●' },
    STOPPED: { color: 'red', symbol: '●' },
    WARNING: { color: 'yellow', symbol: '●' },
    UNKNOWN: { color: 'gray', symbol: '○' }
  };
  const { color, symbol } = config[status] || config.UNKNOWN;
  return <Text color={color}>{symbol} {status}</Text>;
};

const ActionItem = ({ label, description, isSelected, isFocused }) => {
  const borderColor = isFocused ? 'green' : 'gray';
  const textColor = isSelected ? 'green' : 'white';
  
  return (
    <Box 
      borderStyle={isSelected ? 'single' : undefined}
      borderColor={borderColor}
      paddingX={1}
      marginY={1}
    >
      <Text color={textColor} bold={isSelected}>
        {isSelected ? '▸ ' : '  '}
        {label}
      </Text>
      <Text dim> - {description}</Text>
    </Box>
  );
};

const ServerControl = ({ onAction, systemStatus }) => {
  const mcServer = systemStatus?.mcServer || { status: 'UNKNOWN' };
  const botServer = systemStatus?.botServer || { status: 'UNKNOWN' };

  const [mcActions] = useState([
    { label: 'Start', description: 'Start Minecraft server' },
    { label: 'Stop', description: 'Gracefully stop server' },
    { label: 'Restart', description: 'Restart with same settings' },
    { label: 'Force Stop', description: 'Force immediate shutdown' },
  ]);

  const [botActions] = useState([
    { label: 'Start', description: 'Start bot API server' },
    { label: 'Stop', description: 'Stop bot API server' },
    { label: 'View Logs', description: 'Show server logs' },
  ]);

  const [mcSelectedIndex, setMcSelectedIndex] = useState(0);
  const [botSelectedIndex, setBotSelectedIndex] = useState(0);
  const [activePanel, setActivePanel] = useState('minecraft');
  const [executing, setExecuting] = useState(null);

  useInput((input, key) => {
    if (key.upArrow) {
      if (activePanel === 'minecraft') {
        setMcSelectedIndex(prev => Math.max(0, prev - 1));
      } else {
        setBotSelectedIndex(prev => Math.max(0, prev - 1));
      }
    } else if (key.downArrow) {
      if (activePanel === 'minecraft') {
        setMcSelectedIndex(prev => Math.min(mcActions.length - 1, prev + 1));
      } else {
        setBotSelectedIndex(prev => Math.min(botActions.length - 1, prev + 1));
      }
    } else if (key.return) {
      if (activePanel === 'minecraft') {
        console.log(`Execute MC action: ${mcActions[mcSelectedIndex].label}`);
      } else {
        console.log(`Execute Bot action: ${botActions[botSelectedIndex].label}`);
      }
    } else if (key.tab) {
      setActivePanel(prev => prev === 'minecraft' ? 'bot' : 'minecraft');
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="cyan">Server Control</Text>
      <Text dim>───────────────────────────────────────────────────────</Text>
      <Newline />
      
      {/* Status Cards */}
      <Box flexDirection="row" gap={2} marginBottom={2}>
        <Box 
          flexDirection="column" 
          width={36}
          borderStyle="round" 
          borderColor={activePanel === 'minecraft' ? 'green' : 'gray'}
          padding={1}
        >
          <Box marginBottom={1}>
            <Text bold>Minecraft Server</Text>
          </Box>
          <StatusBadge status={mcServer.status} />
          <Text dim>Version: {mcServer.version || 'N/A'}</Text>
          <Text dim>Players: {mcServer.players ?? 0}</Text>
        </Box>
        
        <Box 
          flexDirection="column" 
          width={36}
          borderStyle="round" 
          borderColor={activePanel === 'bot' ? 'green' : 'gray'}
          padding={1}
        >
          <Box marginBottom={1}>
            <Text bold>Bot Server</Text>
          </Box>
          <StatusBadge status={botServer.status} />
          <Text dim>Uptime: {botServer.uptime || 'N/A'}</Text>
          <Text dim>Active Bots: {botServer.activeBots ?? 0}</Text>
        </Box>
      </Box>
      
      {/* Action Panels */}
      <Box flexDirection="row" gap={2}>
        <Box 
          flexDirection="column" 
          width={36}
          borderStyle={activePanel === 'minecraft' ? 'double' : 'single'}
          borderColor={activePanel === 'minecraft' ? 'green' : 'gray'}
          padding={1}
        >
          <Box marginBottom={1}>
            <Text bold color={activePanel === 'minecraft' ? 'green' : 'white'}>
              {activePanel === 'minecraft' ? '▸ ' : '  '}
              Minecraft Actions
            </Text>
          </Box>
          {mcActions.map((action, index) => (
            <Box key={`mc-${index}`} marginY={1}>
              <Text 
                color={activePanel === 'minecraft' && mcSelectedIndex === index ? 'green' : 'white'}
                bold={activePanel === 'minecraft' && mcSelectedIndex === index}
              >
                {activePanel === 'minecraft' && mcSelectedIndex === index ? '▸ ' : '  '}
                {action.label}
              </Text>
              <Text dim> - {action.description}</Text>
            </Box>
          ))}
        </Box>
        
        <Box 
          flexDirection="column" 
          width={36}
          borderStyle={activePanel === 'bot' ? 'double' : 'single'}
          borderColor={activePanel === 'bot' ? 'green' : 'gray'}
          padding={1}
        >
          <Box marginBottom={1}>
            <Text bold color={activePanel === 'bot' ? 'green' : 'white'}>
              {activePanel === 'bot' ? '▸ ' : '  '}
              Bot Server Actions
            </Text>
          </Box>
          {botActions.map((action, index) => (
            <Box key={`bot-${index}`} marginY={1}>
              <Text 
                color={activePanel === 'bot' && botSelectedIndex === index ? 'green' : 'white'}
                bold={activePanel === 'bot' && botSelectedIndex === index}
              >
                {activePanel === 'bot' && botSelectedIndex === index ? '▸ ' : '  '}
                {action.label}
              </Text>
              <Text dim> - {action.description}</Text>
            </Box>
          ))}
        </Box>
      </Box>
      
      <Newline />
      <Text dim>
        <Text color="cyan">Tab</Text> to switch panel • 
        <Text color="cyan">↑↓</Text> to navigate • 
        <Text color="cyan">Enter</Text> to execute
      </Text>
    </Box>
  );
};

export default ServerControl;