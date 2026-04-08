import React from 'react';
import { Box, Text, Newline } from 'ink';

const Help = () => (
  <Box flexDirection="column" padding={1} gap={1}>
    <Text bold color="cyan">MineBot Admin Console - Help</Text>
    <Text dim>─────────────────────────────────────────────────────────────</Text>
    <Newline />
    <Box flexDirection="column" gap={1}>
      <Text bold color="green">Navigation:</Text>
      <Box paddingLeft={2} flexDirection="column">
        <Box><Text bold width={4}>1</Text><Text> Dashboard - System status overview</Text></Box>
        <Box><Text bold width={4}>2</Text><Text> Bot Management - View and manage bots</Text></Box>
        <Box><Text bold width={4}>3</Text><Text> Server Control - Start/stop servers</Text></Box>
        <Box><Text bold width={4}>4</Text><Text> Log Viewer - View system logs</Text></Box>
        <Box><Text bold width={4}>5</Text><Text> Help - This screen</Text></Box>
      </Box>
      <Newline />
      <Text bold color="green">Global Keys:</Text>
      <Box paddingLeft={2} flexDirection="column">
        <Box><Text bold width={8}>Q</Text><Text> Quit the application</Text></Box>
        <Box><Text bold width={8}>H</Text><Text> Show this help screen</Text></Box>
        <Box><Text bold width={8}>R</Text><Text> Refresh current view data</Text></Box>
        <Box><Text bold width={8}>M</Text><Text> Return to Dashboard</Text></Box>
      </Box>
      <Newline />
      <Text bold color="green">Server Control:</Text>
      <Box paddingLeft={2} flexDirection="column">
        <Box><Text bold width={12}>↑↓</Text><Text> Navigate menu items</Text></Box>
        <Box><Text bold width={12}>Enter</Text><Text> Execute selected action</Text></Box>
        <Box><Text bold width={12}>Tab</Text><Text> Switch between Minecraft/Bot panels</Text></Box>
        <Box><Text bold width={12}>Escape</Text><Text> Cancel current action</Text></Box>
      </Box>
      <Newline />
      <Text bold color="green">Color Legend:</Text>
      <Box paddingLeft={2} flexDirection="column">
        <Box><Text color="green" bold width={10}>Green</Text><Text> Running / Selected / Success</Text></Box>
        <Box><Text color="red" bold width={10}>Red</Text><Text> Stopped / Error / Critical</Text></Box>
        <Box><Text color="yellow" bold width={10}>Yellow</Text><Text> Warning / Needs attention</Text></Box>
        <Box><Text color="cyan" bold width={10}>Cyan</Text><Text> Information / Headers</Text></Box>
      </Box>
    </Box>
    <Newline />
    <Text dim>Press [1-5] to navigate, [Q] to quit</Text>
  </Box>
);

export default Help;