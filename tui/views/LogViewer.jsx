import React, { useState, useEffect } from 'react';
import { Box, Text, Newline } from 'ink';
import SelectableMenu from '../components/SelectableMenu.jsx';

const LogEntry = ({ timestamp, level, message, source }) => {
  const levelColor = { INFO: 'blue', WARN: 'yellow', ERROR: 'red', DEBUG: 'gray' }[level?.toUpperCase()] || 'white';
  const formatTime = (ts) => {
    if (!ts) return '--:--:--';
    const d = new Date(ts);
    return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <Box flexDirection="row" gap={1}>
      <Text dim width={10}>{formatTime(timestamp)}</Text>
      <Text color={levelColor} width={8} bold>{(level || '').toUpperCase()}</Text>
      <Text dim width={12}>{source}</Text>
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

  const filterColor = filter === 'ALL' ? 'blue' : filter === 'ERROR' ? 'red' : filter === 'WARN' ? 'yellow' : 'green';

  return (
    <Box flexDirection="column">
      <Box flexDirection="row" justifyContent="space-between">
        <Text bold>Logs</Text>
        <Text dim>filter: <Text color={filterColor} bold>{filter}</Text> · <Text bold>{logs.length}</Text> entries</Text>
      </Box>
      <Text dim>─────────────────────────────────────────────────────────</Text>

      <SelectableMenu
        title="Filters"
        items={logActions}
        selectedIndex={selectedIndex}
        onSelect={handleSelectAction}
        focused={true}
        borderColor="blue"
      />

      <Newline />

      <Box flexDirection="column">
        <Text bold>Entries</Text>
        <Text dim>──────────────────────────────────────</Text>
        <Box flexDirection="row" gap={1} marginBottom={0}>
          <Text dim width={10}>time</Text>
          <Text dim width={8}>level</Text>
          <Text dim width={12}>source</Text>
          <Text dim>message</Text>
        </Box>
        {logs.length > 0 ? (
          <Box flexDirection="column">
            {logs.map((log, i) => <LogEntry key={i} {...log} />)}
          </Box>
        ) : (
          <Text dim>No log entries to display</Text>
        )}
      </Box>

      <Newline />
      <Text dim>
        <Text color="blue">[↑↓]</Text> navigate · <Text color="blue">[Enter]</Text> select filter · <Text color="blue">[1-5]</Text> switch views
      </Text>
    </Box>
  );
};

export default LogViewer;