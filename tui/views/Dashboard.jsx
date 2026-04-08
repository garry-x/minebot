import React, { useState, useEffect } from 'react';
import { Box, Text, Newline } from 'ink';

const StatusBadge = ({ status }) => {
  const color = status === 'RUNNING' ? 'green' : status === 'WARNING' ? 'yellow' : 'red';
  return <Text color={color}>{status}</Text>;
};

const ResourceBar = ({ label, value }) => {
  const barWidth = 20;
  const filled = Math.floor((value / 100) * barWidth);
  const bar = '█'.repeat(filled) + '░'.repeat(barWidth - filled);
  const barColor = value > 80 ? 'red' : value > 60 ? 'yellow' : 'green';
  const statusText = value > 80 ? 'HIGH' : value > 60 ? 'WARNING' : 'OK';

  return (
    <Box>
      <Text bold>{label}: </Text>
      <Text color={barColor}>{bar}</Text>
      <Text> {value}% </Text>
      <Text color={barColor}>{statusText}</Text>
    </Box>
  );
};

const Dashboard = ({ systemStatus }) => {
  const botServer = systemStatus?.botServer || { status: 'UNKNOWN' };
  const mcServer = systemStatus?.mcServer || { status: 'UNKNOWN' };
  const bots = systemStatus?.bots || [];
  const resources = systemStatus ? integration_getResources(systemStatus) : { cpu: 0, memory: 0, disk: 0 };

  return (
    <Box flexDirection="column" padding={1} gap={1}>
      <Text bold color="cyan">System Dashboard</Text>
      <Text dim>───────────────────────────────────────────────────────</Text>
      <Newline />
      <Box flexDirection="row" gap={4}>
        <Box flexDirection="column" width={40}>
          <Text bold>Bot Server:</Text>
          <Box paddingLeft={2} flexDirection="column">
            <Box><Text>Status: </Text><StatusBadge status={botServer.status} /></Box>
            {botServer.uptime && <Text dim>  Uptime: {botServer.uptime}</Text>}
            {botServer.version && <Text dim>  Version: {botServer.version}</Text>}
            {botServer.activeBots !== undefined && <Text dim>  Active Bots: {botServer.activeBots}</Text>}
          </Box>
        </Box>
        <Box flexDirection="column" width={40}>
          <Text bold>Minecraft Server:</Text>
          <Box paddingLeft={2} flexDirection="column">
            <Box><Text>Status: </Text><StatusBadge status={mcServer.status} /></Box>
            {mcServer.players !== undefined && <Text dim>  Players: {mcServer.players}</Text>}
            {mcServer.version && <Text dim>  Version: {mcServer.version}</Text>}
          </Box>
        </Box>
      </Box>
      <Newline />
      <Box flexDirection="column">
        <Text bold>Active Bots ({bots.length}):</Text>
        {bots.length > 0 ? (
          <Box flexDirection="column" paddingLeft={2}>
            <Box flexDirection="row" gap={4}>
              <Text bold width={15}>Name</Text>
              <Text bold width={10}>Status</Text>
              <Text bold width={15}>Location</Text>
              <Text bold width={8}>Health</Text>
            </Box>
            {bots.map((bot, i) => (
              <Box key={i} flexDirection="row" gap={4}>
                <Text color="green" width={15}>{bot.name}</Text>
                <Text color={bot.status === 'ALIVE' ? 'green' : 'red'} width={10}>{bot.status}</Text>
                <Text width={15}>{bot.location || 'Unknown'}</Text>
                <Text color={bot.health > 15 ? 'green' : bot.health > 5 ? 'yellow' : 'red'} width={8}>{bot.health}</Text>
              </Box>
            ))}
          </Box>
        ) : (
          <Text dim paddingLeft={2}>No active bots</Text>
        )}
      </Box>
      <Newline />
      <Box flexDirection="column">
        <Text bold>System Resources:</Text>
        <Box paddingLeft={2} flexDirection="column">
          <ResourceBar label="CPU" value={resources.cpu} />
          <ResourceBar label="Memory" value={resources.memory} />
          <ResourceBar label="Disk" value={resources.disk} />
        </Box>
      </Box>
      <Newline />
      <Text dim>Press [1-5] to navigate, [R] to refresh, [Q] to quit</Text>
    </Box>
  );
};

function integration_getResources(status) {
  if (!status) return { cpu: 0, memory: 0, disk: 0 };
  const res = status.resources;
  if (res) return { cpu: Math.round(res.cpu), memory: Math.round(res.memory), disk: Math.round(res.disk) };
  return { cpu: 0, memory: 0, disk: 0 };
}

export default Dashboard;