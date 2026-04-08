import React, { useState, useCallback } from 'react';
import { Box, Text, Newline } from 'ink';
import SelectableMenu from '../components/SelectableMenu.jsx';
import * as integration from '../integration.mjs';

const StatusBadge = ({ status }) => {
  const color = status === 'RUNNING' ? 'green' : status === 'STOPPED' ? 'red' : 'yellow';
  return <Text color={color} bold>{status}</Text>;
};

const ServerControl = ({ onAction, systemStatus }) => {
  const mcServer = systemStatus?.mcServer || { status: 'UNKNOWN' };
  const botServer = systemStatus?.botServer || { status: 'UNKNOWN' };

  const [mcActions] = useState([
    { label: 'Start Server', description: 'Start Minecraft server' },
    { label: 'Stop Server', description: 'Gracefully stop server' },
    { label: 'Restart Server', description: 'Restart with same settings' },
    { label: 'Force Stop', description: 'Force immediate shutdown' },
  ]);

  const [botActions] = useState([
    { label: 'Start Bot Server', description: 'Start bot API server' },
    { label: 'Stop Bot Server', description: 'Stop bot API server' },
    { label: 'View Logs', description: 'Show server logs' },
  ]);

  const [mcSelectedIndex, setMcSelectedIndex] = useState(0);
  const [botSelectedIndex, setBotSelectedIndex] = useState(0);
  const [activePanel, setActivePanel] = useState('minecraft');
  const [executing, setExecuting] = useState(null);

  const executeMcAction = useCallback(async (index) => {
    const action = mcActions[index];
    setExecuting(`minecraft:${action.label}`);
    onAction(`Executing: ${action.label}...`);

    try {
      let result;
      switch (index) {
        case 0: result = await integration.startMinecraftServer(); break;
        case 1: result = await integration.stopMinecraftServer(); break;
        case 2: result = await integration.restartMinecraftServer(); break;
        case 3: result = await integration.stopMinecraftServer(true); break;
      }
      onAction(result?.message || result?.success ? `${action.label}: done` : `${action.label}: failed`);
    } catch (e) {
      onAction(`${action.label}: error - ${e.message}`);
    }
    setExecuting(null);
  }, [mcActions, onAction]);

  const executeBotAction = useCallback(async (index) => {
    const action = botActions[index];
    if (index === 2) {
      onAction('bot:View Logs');
      return;
    }
    setExecuting(`bot:${action.label}`);
    onAction(`Executing: ${action.label}...`);

    try {
      let result;
      switch (index) {
        case 0: result = await integration.startBotServer(); break;
        case 1: result = await integration.stopBotServer(); break;
      }
      onAction(result?.message || result?.success ? `${action.label}: done` : `${action.label}: failed`);
    } catch (e) {
      onAction(`${action.label}: error - ${e.message}`);
    }
    setExecuting(null);
  }, [botActions, onAction]);

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="cyan">Server Control</Text>
      <Text dim>───────────────────────────────────────────────────────</Text>
      <Newline />
      <Text bold>Server Status:</Text>
      <Box flexDirection="row" gap={4} marginY={1}>
        <Box flexDirection="column" width={40}>
          <Text>Minecraft Server: <StatusBadge status={mcServer.status} /></Text>
          {mcServer.version && <Text dim>  Version: {mcServer.version}</Text>}
          {mcServer.players !== undefined && <Text dim>  Players: {mcServer.players}</Text>}
        </Box>
        <Box flexDirection="column" width={40}>
          <Text>Bot Server: <StatusBadge status={botServer.status} /></Text>
          {botServer.uptime && <Text dim>  Uptime: {botServer.uptime}</Text>}
          {botServer.activeBots !== undefined && <Text dim>  Active Bots: {botServer.activeBots}</Text>}
        </Box>
      </Box>
      <Newline />
      <Box flexDirection="row" gap={4}>
        <Box flexDirection="column" flexGrow={1}>
          <SelectableMenu
            items={mcActions}
            selectedIndex={mcSelectedIndex}
            onSelect={setMcSelectedIndex}
            onCancel={() => onAction('cancelled')}
            title="Minecraft Actions"
            focused={activePanel === 'minecraft'}
            borderColor="green"
          />
        </Box>
        <Box flexDirection="column" flexGrow={1}>
          <SelectableMenu
            items={botActions}
            selectedIndex={botSelectedIndex}
            onSelect={setBotSelectedIndex}
            onCancel={() => onAction('cancelled')}
            title="Bot Server Actions"
            focused={activePanel === 'bot'}
            borderColor="blue"
          />
        </Box>
      </Box>
      <Newline />
      <Box flexDirection="column">
        <Text dim>
          {activePanel === 'minecraft'
            ? <>▶ <Text color="green">Minecraft Actions</Text> panel focused • [Tab] to switch • [1-5] to switch views</>
            : <>▶ <Text color="blue">Bot Server Actions</Text> panel focused • [Tab] to switch • [1-5] to switch views</>}
        </Text>
      </Box>
    </Box>
  );
};

export default ServerControl;