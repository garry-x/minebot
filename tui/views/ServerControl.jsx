import React, { useState, useCallback } from 'react';
import { Box, Text, Newline, useInput } from 'ink';
import * as integration from '../integration.mjs';

const StatusBadge = ({ status }) => {
  const config = {
    RUNNING: { color: 'green', symbol: '●' },
    NOT_RUNNING: { color: 'red', symbol: '●' },
    STOPPED: { color: 'red', symbol: '●' },
    WARNING: { color: 'yellow', symbol: '●' },
    UNKNOWN: { color: 'gray', symbol: '○' },
  };
  const { color, symbol } = config[status] || config.UNKNOWN;
  return <Text><Text color={color}>{symbol}</Text> <Text color={color}>{status}</Text></Text>;
};

const Section = ({ title, children, width, active }) => (
  <Box flexDirection="column" width={width}>
    <Box marginBottom={0}>
      <Text bold color={active ? 'white' : 'gray'}>{active ? '▸ ' : '  '}{title}</Text>
    </Box>
    <Text dim>──────────────────────────────────────</Text>
    <Box flexDirection="column" marginTop={0}>
      {children}
    </Box>
  </Box>
);

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
    <Box flexDirection="column">
      <Box flexDirection="row" gap={4} marginBottom={1}>
        <Box flexDirection="column">
          <Text dim>minecraft server</Text>
          <StatusBadge status={mcServer.status} />
          <Text dim>v{mcServer.version || 'N/A'} · {mcServer.players ?? 0} players</Text>
        </Box>
        <Box flexDirection="column">
          <Text dim>bot server</Text>
          <StatusBadge status={botServer.status} />
          <Text dim>uptime {botServer.uptime || 'N/A'} · {botServer.activeBots ?? 0} bots</Text>
        </Box>
      </Box>

      <Text dim>─────────────────────────────────────────────────────────</Text>

      <Box flexDirection="row" gap={2}>
        <Section title="Minecraft Actions" width={36} active={activePanel === 'minecraft'}>
          <Box flexDirection="column">
            {mcActions.map((action, index) => {
              const isSelected = activePanel === 'minecraft' && mcSelectedIndex === index;
              return (
                <Box key={`mc-${index}`}>
                  <Text color={isSelected ? 'green' : 'gray'}>
                    {isSelected ? '▸ ' : '  '}
                  </Text>
                  <Text color={isSelected ? 'white' : 'gray'} bold={isSelected}>
                    {action.label}
                  </Text>
                  <Text dim>{'  '}{action.description}</Text>
                </Box>
              );
            })}
          </Box>
        </Section>

        <Section title="Bot Server Actions" width={36} active={activePanel === 'bot'}>
          <Box flexDirection="column">
            {botActions.map((action, index) => {
              const isSelected = activePanel === 'bot' && botSelectedIndex === index;
              return (
                <Box key={`bot-${index}`}>
                  <Text color={isSelected ? 'green' : 'gray'}>
                    {isSelected ? '▸ ' : '  '}
                  </Text>
                  <Text color={isSelected ? 'white' : 'gray'} bold={isSelected}>
                    {action.label}
                  </Text>
                  <Text dim>{'  '}{action.description}</Text>
                </Box>
              );
            })}
          </Box>
        </Section>
      </Box>

      <Newline />
      <Text dim>
        <Text color="blue">[Tab]</Text> switch panel · <Text color="blue">[↑↓]</Text> navigate · <Text color="blue">[Enter]</Text> execute
      </Text>
    </Box>
  );
};

export default ServerControl;