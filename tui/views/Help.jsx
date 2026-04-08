import React from 'react';
import { Box, Text, Newline } from 'ink';

const Kbd = ({ children }) => (
  <Text color="blue" bold>{children}</Text>
);

const Help = () => (
  <Box flexDirection="column">
    <Text bold>Help</Text>
    <Text dim>─────────────────────────────────────────────────────────</Text>
    <Newline />

    <Text bold color="white">Navigation</Text>
    <Box paddingLeft={2} flexDirection="column">
      <Box><Kbd>[1]</Kbd><Text dim>  Dashboard — system status overview</Text></Box>
      <Box><Kbd>[2]</Kbd><Text dim>  Bots — view and manage bots</Text></Box>
      <Box><Kbd>[3]</Kbd><Text dim>  Servers — start/stop servers</Text></Box>
      <Box><Kbd>[4]</Kbd><Text dim>  Logs — view system logs</Text></Box>
      <Box><Kbd>[5]</Kbd><Text dim>  Help — this screen</Text></Box>
    </Box>
    <Newline />

    <Text bold color="white">Global Keys</Text>
    <Box paddingLeft={2} flexDirection="column">
      <Box><Kbd>[q]</Kbd><Text dim>    Quit the application</Text></Box>
      <Box><Kbd>[h]</Kbd><Text dim>    Show this help screen</Text></Box>
      <Box><Kbd>[r]</Kbd><Text dim>    Refresh current view data</Text></Box>
      <Box><Kbd>[m]</Kbd><Text dim>    Return to Dashboard</Text></Box>
    </Box>
    <Newline />

    <Text bold color="white">Server Control</Text>
    <Box paddingLeft={2} flexDirection="column">
      <Box><Kbd>[↑↓]</Kbd><Text dim>   Navigate menu items</Text></Box>
      <Box><Kbd>[Enter]</Kbd><Text dim> Execute selected action</Text></Box>
      <Box><Kbd>[Tab]</Kbd><Text dim>   Switch between Minecraft/Bot panels</Text></Box>
    </Box>
    <Newline />

    <Text bold color="white">Status Indicators</Text>
    <Box paddingLeft={2} flexDirection="column">
      <Box><Text color="green">● </Text><Text>Running / Alive / Success</Text></Box>
      <Box><Text color="red">● </Text><Text>Stopped / Error / Critical</Text></Box>
      <Box><Text color="yellow">● </Text><Text>Warning / Needs attention</Text></Box>
      <Box><Text color="gray">○ </Text><Text>Unknown / Inactive</Text></Box>
    </Box>
    <Newline />

    <Text dim>Press <Kbd>[1-5]</Kbd> to navigate, <Kbd>[q]</Kbd> to quit</Text>
  </Box>
);

export default Help;