import React, { useState, useEffect } from 'react';
import { Box, Text, Newline } from 'ink';
import * as integration from '../integration.mjs';

const BotManagement = ({ systemStatus }) => {
  const [bots, setBots] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

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
    <Box flexDirection="column" padding={1}>
      <Text bold color="cyan">Bot Management</Text>
      <Text dim>───────────────────────────────────────────────────────</Text>
      <Newline />
      <Text bold>Available Bots ({bots.length}):</Text>
      <Newline />
      {bots.length > 0 ? (
        <Box flexDirection="column">
          <Box flexDirection="row" marginBottom={1}>
            <Box width={20}><Text bold>Name</Text></Box>
            <Box width={12}><Text bold>Status</Text></Box>
            <Box width={15}><Text bold>Location</Text></Box>
            <Box width={8}><Text bold>Health</Text></Box>
          </Box>
          {bots.map((bot, index) => (
            <Box key={bot.name || index} flexDirection="row" marginBottom={1}>
              <Box width={20}>
                <Text color={index === selectedIndex ? 'green' : 'white'}>
                  {index === selectedIndex ? '› ' : '  '}{bot.name || 'Unknown'}
                </Text>
              </Box>
              <Box width={12}>
                <Text color={bot.status === 'ALIVE' ? 'green' : bot.status === 'WOUNDED' ? 'yellow' : 'red'}>
                  {bot.status}
                </Text>
              </Box>
              <Box width={15}>
                <Text dim>{bot.location || 'Unknown'}</Text>
              </Box>
              <Box width={8}>
                <Text color={bot.health > 15 ? 'green' : bot.health > 5 ? 'yellow' : 'red'}>
                  {bot.health || 0}
                </Text>
              </Box>
            </Box>
          ))}
        </Box>
      ) : (
        <Box paddingLeft={2}>
          <Text dim>No bots connected</Text>
          <Newline />
          <Text>Use "Start New Bot" to create your first bot.</Text>
        </Box>
      )}
      <Newline />
      <Text bold>Bot Actions:</Text>
      <Box flexDirection="column" marginY={1}>
        {botActions.map((action, index) => (
          <Box key={index}>
            <Text color={index === selectedIndex ? 'green' : 'white'}>
              {index === selectedIndex ? '› ' : '  '}{action.label}
            </Text>
            <Text dim> ({action.description})</Text>
          </Box>
        ))}
      </Box>
      <Text dim>↑↓: Select action/bot | Enter: Execute | 1-5: Switch views</Text>
    </Box>
  );
};

export default BotManagement;