import React from 'react';
import { Box, Text } from 'ink';

/**
 * Footer component for the TUI admin console
 * Displays status information and keyboard shortcuts
 * 
 * @param {Object} props
 * @param {string} props.currentView - Currently active view name
 */
const Footer = ({ currentView }) => {
  return (
    <Box marginTop={1}>
      <Text dim>[Q] Quit  [H] Help  [R] Refresh  [M] Menu</Text>
      <Text>   |   Current: {currentView}</Text>
    </Box>
  );
};

export default Footer;