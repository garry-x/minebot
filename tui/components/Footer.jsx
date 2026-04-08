import React from 'react';
import { Box, Text } from 'ink';

const Shortcut = ({ key, description }) => (
  <Box marginRight={2}>
    <Text color="cyan" bold>{key}</Text>
    <Text dim> {description}</Text>
  </Box>
);

const Footer = ({ currentView }) => {
  return (
    <Box 
      flexDirection="column" 
      marginTop={1}
      borderStyle="single"
      borderColor="gray"
      paddingX={1}
      paddingY={1}
    >
      <Box flexDirection="row" marginBottom={1}>
        <Shortcut key="1-5" description="Switch views" />
        <Shortcut key="↑↓" description="Navigate" />
        <Shortcut key="Enter" description="Select" />
        <Shortcut key="Tab" description="Switch panel" />
      </Box>
      <Box flexDirection="row">
        <Shortcut key="q" description="Quit" />
        <Shortcut key="h" description="Help" />
        <Shortcut key="r" description="Refresh" />
        <Box marginLeft={4}>
          <Text dim>Current: </Text>
          <Text color="cyan">{currentView}</Text>
        </Box>
      </Box>
    </Box>
  );
};

export default Footer;