import React, { useState, useEffect } from 'react';
import { Box, Text, Newline } from 'ink';

const StatusBadge = ({ status }) => {
  const config = {
    RUNNING: { color: 'green', symbol: '●' },
    ALIVE: { color: 'green', symbol: '●' },
    STOPPED: { color: 'red', symbol: '●' },
    WARNING: { color: 'yellow', symbol: '●' },
    UNKNOWN: { color: 'gray', symbol: '○' }
  };
  const { color, symbol } = config[status] || config.UNKNOWN;
  return <Text color={color}>{symbol} {status}</Text>;
};

const ResourceBar = ({ label, value, max = 100 }) => {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));
  const barWidth = 20;
  const filled = Math.floor((percentage / 100) * barWidth);
  const empty = barWidth - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  
  let color = 'green';
  if (percentage > 80) color = 'red';
  else if (percentage > 60) color = 'yellow';
  
  const statusText = percentage > 80 ? 'HIGH' : percentage > 60 ? 'WARN' : 'OK';
  
  return (
    <Box>
      <Text bold width={8}>{label}</Text>
      <Text> </Text>
      <Text color={color}>{bar}</Text>
      <Text> {Math.round(value)}% </Text>
      <Text color={color} bold>{statusText}</Text>
    </Box>
  );
};

const Card = ({ title, children, width = 38 }) => (
  <Box 
    flexDirection="column" 
    width={width}
    borderStyle="round" 
    borderColor="blue"
    padding={1}
  >
    <Box marginBottom={1}>
      <Text bold color="cyan">{title}</Text>
    </Box>
    {children}
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
    <Box flexDirection="column" padding={1} gap={1}>
      <Text bold color="cyan">Dashboard</Text>
      <Text dim>System Overview</Text>
      <Newline />
      
      <Box flexDirection="row" gap={2}>
        <Card title="Bot Server" width={36}>
          <Box flexDirection="column" gap={1}>
            <StatusBadge status={stats.botServer.status} />
            <Text dim>Uptime: {stats.botServer.uptime}</Text>
            <Text dim>Version: {stats.botServer.version}</Text>
            <Text dim>Active: {stats.botServer.activeBots} bots</Text>
          </Box>
        </Card>
        
        <Card title="Minecraft Server" width={36}>
          <Box flexDirection="column" gap={1}>
            <StatusBadge status={stats.mcServer.status} />
            <Text dim>Players: {stats.mcServer.players}</Text>
            <Text dim>World: {stats.mcServer.world}</Text>
            <Text dim>Version: {stats.mcServer.version}</Text>
          </Box>
        </Card>
      </Box>
      
      <Newline />
      
      <Card title="Active Bots" width={74}>
        {stats.bots.length > 0 ? (
          <Box flexDirection="column" gap={1}>
            <Box flexDirection="row">
              <Text bold width={16}>Name</Text>
              <Text bold width={10}>Status</Text>
              <Text bold width={16}>Location</Text>
              <Text bold width={8}>Health</Text>
            </Box>
            {stats.bots.map((bot, index) => (
              <Box key={`bot-${index}`} flexDirection="row">
                <Text color="green" width={16}>{bot.name}</Text>
                <Text color={bot.status === 'ALIVE' ? 'green' : 'red'} width={10}>{bot.status}</Text>
                <Text dim width={16}>{bot.location}</Text>
                <Text color={parseInt(bot.health) > 15 ? 'green' : parseInt(bot.health) > 5 ? 'yellow' : 'red'} width={8}>{bot.health}</Text>
              </Box>
            ))}
          </Box>
        ) : (
          <Text dim>No active bots</Text>
        )}
      </Card>
      
      <Newline />
      
      <Card title="System Resources" width={74}>
        <Box flexDirection="column" gap={1}>
          <ResourceBar label="CPU" value={Math.round(stats.resources.cpu)} />
          <ResourceBar label="Memory" value={Math.round(stats.resources.memory)} />
          <ResourceBar label="Disk" value={Math.round(stats.resources.disk)} />
        </Box>
      </Card>
    </Box>
  );
};

export default Dashboard;