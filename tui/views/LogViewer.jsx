import React, { useState, useEffect } from 'react';
import { Box, Text, Newline } from 'ink';
import SelectableMenu from '../components/SelectableMenu.jsx';

const LogEntry = ({ timestamp, level, message, source }) => {
  const levelColor = { INFO: 'cyan', WARN: 'yellow', ERROR: 'red', DEBUG: 'gray' }[level?.toUpperCase()] || 'white';
  const formatTime = (ts) => {
    if (!ts) return '--:--:--';
    const d = new Date(ts);
    return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <Box flexDirection="row" gap={2}>
      <Text dim width={10}>{formatTime(timestamp)}</Text>
      <Text color={levelColor} width={8} bold>{(level || '').toUpperCase()}</Text>
      <Text width={12}>{source}</Text>
      <Text>{message}</Text>
    </Box>
  );
};

const LogViewer = () => {
  const [logs, setLogs] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const logActions = [
    { label: 'All Logs', description: 'Show all log entries' },
    { label: 'Errors Only', description: 'Show only ERROR level logs' },
    { label: 'Warnings & Errors', description: 'Show WARN and ERROR logs' },
    { label: 'Bot Server Logs', description: 'Filter by bot server source' },
    { label: 'Minecraft Logs', description: 'Filter by Minecraft server' },
    { label: 'Clear Logs', description: 'Clear current log display' },
  ];

  useEffect(() => {
    const sampleLogs = [
      { timestamp: Date.now() - 60000, level: 'INFO', message: 'Bot server started successfully', source: 'bot-server' },
      { timestamp: Date.now() - 55000, level: 'INFO', message: 'Minecraft server connection established', source: 'minecraft' },
      { timestamp: Date.now() - 50000, level: 'WARN', message: 'High memory usage detected (85%)', source: 'system' },
      { timestamp: Date.now() - 45000, level: 'INFO', message: 'ConsoleTestBot joined the game', source: 'bot-1' },
      { timestamp: Date.now() - 40000, level: 'INFO', message: 'OptimizedBot joined the game', source: 'bot-2' },
      { timestamp: Date.now() - 35000, level: 'ERROR', message: 'Failed to load chunk at (12, 68, -45)', source: 'bot-1' },
      { timestamp: Date.now() - 30000, level: 'INFO', message: 'World backup completed successfully', source: 'system' },
      { timestamp: Date.now() - 25000, level: 'WARN', message: 'Network latency increased (150ms)', source: 'network' },
      { timestamp: Date.now() - 20000, level: 'INFO', message: 'User admin logged in via console', source: 'auth' },
      { timestamp: Date.now() - 15000, level: 'DEBUG', message: 'Processing bot movement path', source: 'bot-2' },
      { timestamp: Date.now() - 10000, level: 'INFO', message: 'Database connection pool optimized', source: 'database' },
      { timestamp: Date.now() - 5000, level: 'ERROR', message: 'Authentication timeout for Xbox Live', source: 'auth' },
    ];

    let filtered = [...sampleLogs];
    switch (filter) {
      case 'ERROR': filtered = sampleLogs.filter(l => l.level === 'ERROR'); break;
      case 'WARN': filtered = sampleLogs.filter(l => l.level === 'WARN' || l.level === 'ERROR'); break;
      case 'BOT': filtered = sampleLogs.filter(l => l.source.startsWith('bot')); break;
      case 'MC': filtered = sampleLogs.filter(l => l.source === 'minecraft'); break;
    }
    setLogs(filtered);
  }, [filter]);

  const handleSelectAction = (index) => {
    setSelectedIndex(index);
    const filterMap = { 0: 'ALL', 1: 'ERROR', 2: 'WARN', 3: 'BOT', 4: 'MC' };
    if (index <= 4) setFilter(filterMap[index]);
    if (index === 5) setLogs([]);
  };

  return (
    <Box flexDirection="column" padding={1} gap={1}>
      <Text bold color="cyan">Log Viewer</Text>
      <Text dim>───────────────────────────────────────────────────────</Text>
      <Newline />
      <Box flexDirection="row" justifyContent="space-between">
        <Box><Text>Filter: </Text><Text color={filter === 'ALL' ? 'cyan' : filter === 'ERROR' ? 'red' : filter === 'WARN' ? 'yellow' : 'green'} bold>{filter}</Text></Box>
        <Box><Text>Showing: </Text><Text color="cyan" bold>{logs.length}</Text><Text> entries</Text></Box>
      </Box>
      <Newline />
      <SelectableMenu
        title="Log Actions"
        items={logActions}
        selectedIndex={selectedIndex}
        onSelect={handleSelectAction}
        focused={true}
        borderColor="yellow"
      />
      <Newline />
      <Box flexDirection="column" borderStyle="single" borderColor="gray" padding={1}>
        <Text bold>Recent Log Entries:</Text>
        <Newline />
        <Box flexDirection="row" gap={2} marginBottom={1}>
          <Text dim width={10}>Time</Text>
          <Text dim width={8}>Level</Text>
          <Text dim width={12}>Source</Text>
          <Text dim>Message</Text>
        </Box>
        {logs.length > 0 ? (
          <Box flexDirection="column" gap={0}>
            {logs.map((log, i) => <LogEntry key={i} {...log} />)}
          </Box>
        ) : (
          <Box paddingLeft={2}><Text dim>No log entries to display</Text></Box>
        )}
      </Box>
      <Newline />
      <Text dim>[↑↓] Navigate actions • [Enter] Select filter • [1-5] Switch views</Text>
    </Box>
  );
};

export default LogViewer;