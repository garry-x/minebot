import React, { useState, useEffect } from 'react';
import { Box, Text, Newline } from 'ink';

const StatusBadge = ({ status }) => {
  const config = {
    RUNNING: { color: 'green', symbol: '●' },
    ALIVE: { color: 'green', symbol: '●' },
    NOT_RUNNING: { color: 'red', symbol: '●' },
    STOPPED: { color: 'red', symbol: '●' },
    WARNING: { color: 'yellow', symbol: '●' },
    UNKNOWN: { color: 'gray', symbol: '○' },
  };
  const { color, symbol } = config[status] || config.UNKNOWN;
  return <Text><Text color={color}>{symbol}</Text> <Text color={color}>{status}</Text></Text>;
};

const ResourceBar = ({ label, value, max = 100 }) => {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));
  const barWidth = 24;
  const filled = Math.floor((percentage / 100) * barWidth);
  const empty = barWidth - filled;

  let color = 'green';
  if (percentage > 80) color = 'red';
  else if (percentage > 60) color = 'yellow';

  return (
    <Box>
      <Text dim width={8}>{label}</Text>
      <Text color={color}>{'█'.repeat(filled)}</Text>
      <Text dim>{'░'.repeat(empty)}</Text>
      <Text> {Math.round(value)}%</Text>
    </Box>
  );
};

const Section = ({ title, children, width }) => (
  <Box flexDirection="column" width={width}>
    <Box marginBottom={0}>
      <Text bold color="white">{title}</Text>
    </Box>
    <Text dim>──────────────────────────────────────</Text>
    <Box flexDirection="column" marginTop={0}>
      {children}
    </Box>
  </Box>
);

const Dashboard = ({ systemStatus }) => {
  const [stats, setStats] = useState({
    botServer: { status: 'RUNNING', uptime: '2h 34m', version: '1.0.0', activeBots: 2 },
    mcServer: { status: 'RUNNING', players: 0, address: 'localhost:25565', world: 'default', version: '1.21.11' },
    bots: [
      { name: 'ConsoleTestBot', status: 'ALIVE', location: '4, 68, 17', health: '20' },
      { name: 'OptimizedBot', status: 'ALIVE', location: '4, 68, 17', health: '20' }
    ],
    resources: { cpu: 25, memory: 36, disk: 13 }
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setStats(prev => ({
        ...prev,
        resources: {
          cpu: Math.min(100, Math.max(0, prev.resources.cpu + (Math.random() * 10 - 5))),
          memory: Math.min(100, Math.max(0, prev.resources.memory + (Math.random() * 5 - 2.5))),
          disk: Math.min(100, Math.max(0, prev.resources.disk + (Math.random() * 2 - 1)))
        }
      }));
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Box flexDirection="column">
      <Section title="Status">
        <Box flexDirection="row" gap={4}>
          <Box flexDirection="column">
            <Text dim>bot server</Text>
            <StatusBadge status={stats.botServer.status} />
            <Text dim>uptime {stats.botServer.uptime} · v{stats.botServer.version}</Text>
            <Text dim>{stats.botServer.activeBots} bots connected</Text>
          </Box>
          <Box flexDirection="column">
            <Text dim>minecraft server</Text>
            <StatusBadge status={stats.mcServer.status} />
            <Text dim>{stats.mcServer.players} players · v{stats.mcServer.version}</Text>
            <Text dim>world: {stats.mcServer.world}</Text>
          </Box>
        </Box>
      </Section>

      <Newline />

      <Section title="Bots">
        {stats.bots.length > 0 ? (
          <Box flexDirection="column">
            <Box flexDirection="row">
              <Text bold dim width={18}>name</Text>
              <Text bold dim width={10}>status</Text>
              <Text bold dim width={14}>location</Text>
              <Text bold dim width={8}>health</Text>
            </Box>
            {stats.bots.map((bot, i) => (
              <Box key={`bot-${i}`} flexDirection="row">
                <Text width={18}>{bot.name}</Text>
                <Box width={10}>
                  <StatusBadge status={bot.status} />
                </Box>
                <Text dim width={14}>{bot.location}</Text>
                <Text color={parseInt(bot.health) > 15 ? 'green' : parseInt(bot.health) > 5 ? 'yellow' : 'red'} width={8}>{bot.health}/20</Text>
              </Box>
            ))}
          </Box>
        ) : (
          <Text dim>No bots connected</Text>
        )}
      </Section>

      <Newline />

      <Section title="Resources">
        <Box flexDirection="column">
          <ResourceBar label="cpu" value={Math.round(stats.resources.cpu)} />
          <ResourceBar label="memory" value={Math.round(stats.resources.memory)} />
          <ResourceBar label="disk" value={Math.round(stats.resources.disk)} />
        </Box>
      </Section>
    </Box>
  );
};

export default Dashboard;