import React, { useState, useEffect } from 'react';
import { Box, Text, Newline, useInput } from 'ink';
import * as integration from '../integration.mjs';

const StatusBadge = ({ status }) => {
  const config = {
    ALIVE: { color: 'green', symbol: '●' },
    WOUNDED: { color: 'yellow', symbol: '●' },
    DEAD: { color: 'red', symbol: '●' },
    UNKNOWN: { color: 'gray', symbol: '○' },
  };
  const { color, symbol } = config[status] || config.UNKNOWN;
  return <Text><Text color={color}>{symbol}</Text></Text>;
};

const BotManagement = ({ systemStatus }) => {
  const [bots, setBots] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [activeSection, setActiveSection] = useState('bots');

  useInput((input, key) => {
    if (key.upArrow) {
      if (activeSection === 'bots') {
        setSelectedIndex(prev => Math.max(0, prev - 1));
      } else {
        setActiveSection('bots');
        setSelectedIndex(bots.length > 0 ? bots.length - 1 : 0);
      }
    } else if (key.downArrow) {
      if (activeSection === 'bots') {
        if (selectedIndex < bots.length - 1) {
          setSelectedIndex(prev => prev + 1);
        } else {
          setActiveSection('actions');
          setSelectedIndex(0);
        }
      } else {
        setSelectedIndex(prev => Math.min(botActions.length - 1, prev + 1));
      }
    } else if (key.return) {
      if (activeSection === 'actions' && selectedIndex < botActions.length) {
        console.log(`Executing: ${botActions[selectedIndex].label}`);
      }
    }
  });

  useEffect(() => {
    const loadBots = async () => {
      try {
        const botList = await integration.getAllBots();
        setBots(botList.length > 0 ? botList : []);
      } catch {
        setBots([]);
      }
    };
    loadBots();
    const interval = setInterval(loadBots, 10000);
    return () => clearInterval(interval);
  }, []);

  const botActions = [
    { label: 'Start New Bot', description: 'Create and start a new bot instance' },
    { label: 'Stop Bot', description: 'Stop selected bot instance' },
    { label: 'View Bot Details', description: 'Show detailed information about bot' },
  ];

  return (
    <Box flexDirection="column">
      <Box flexDirection="column">
        <Text bold>Bots</Text>
        <Text dim>─────────────────────────────────────────────────────────</Text>
        {bots.length > 0 ? (
          <Box flexDirection="column">
            <Box flexDirection="row" marginBottom={0}>
              <Text bold dim width={18}>name</Text>
              <Text bold dim width={10}>status</Text>
              <Text bold dim width={14}>location</Text>
              <Text bold dim width={8}>health</Text>
            </Box>
            {bots.map((bot, index) => {
              const isSelected = activeSection === 'bots' && index === selectedIndex;
              return (
                <Box key={`bot-${bot.name || index}`} flexDirection="row">
                  <Text color={isSelected ? 'green' : 'gray'} width={2}>{isSelected ? '▸' : ' '}</Text>
                  <Text color={isSelected ? 'white' : 'gray'} bold={isSelected} width={16}>{bot.name || 'Unknown'}</Text>
                  <Box width={10}>
                    <StatusBadge status={bot.status} />
                    <Text color={bot.status === 'ALIVE' ? 'green' : bot.status === 'WOUNDED' ? 'yellow' : 'red'}> {bot.status}</Text>
                  </Box>
                  <Text dim width={14}>{bot.location || 'Unknown'}</Text>
                  <Text color={bot.health > 15 ? 'green' : bot.health > 5 ? 'yellow' : 'red'} width={8}>{bot.health || 0}/20</Text>
                </Box>
              );
            })}
          </Box>
        ) : (
          <Box paddingLeft={2} flexDirection="column">
            <Text dim>No bots connected</Text>
            <Text dim>Use "Start New Bot" to create your first bot.</Text>
          </Box>
        )}
      </Box>

      <Newline />

      <Box flexDirection="column">
        <Text bold>Actions</Text>
        <Text dim>─────────────────────────────────────────────────────────</Text>
        <Box flexDirection="column">
          {botActions.map((action, index) => {
            const isSelected = activeSection === 'actions' && index === selectedIndex;
            return (
              <Box key={`action-${index}`}>
                <Text color={isSelected ? 'green' : 'gray'}>{isSelected ? '▸ ' : '  '}</Text>
                <Text color={isSelected ? 'white' : 'gray'} bold={isSelected}>{action.label}</Text>
                <Text dim>{'  '}{action.description}</Text>
              </Box>
            );
          })}
        </Box>
      </Box>

      <Newline />
      <Text dim>
        <Text color="blue">[↑↓]</Text> select · <Text color="blue">[Enter]</Text> execute · <Text color="blue">[1-5]</Text> switch views
      </Text>
    </Box>
  );
};

export default BotManagement;