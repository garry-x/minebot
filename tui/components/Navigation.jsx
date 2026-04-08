import React from 'react';
import { Box, Text } from 'ink';

/**
 * Navigation component for the TUI admin console
 * Displays a horizontal navigation bar with clickable items
 * 
 * @param {Object} props
 * @param {string} props.currentView - Currently active view
 * @param {Array} props.navItems - Array of navigation items with {key, label, view}
 * @param {Function} props.onViewChange - Callback when view changes
 */
const Navigation = ({ currentView, navItems, onViewChange }) => {
  return (
    <Box flexDirection="row" marginBottom={1}>
      {navItems.map((item) => (
        <Box key={item.key} marginRight={3}>
          <Text
            color={currentView === item.view ? 'green' : 'white'}
            bold={currentView === item.view}
          >
            [{item.key}] {item.label}
          </Text>
        </Box>
      ))}
    </Box>
  );
};

export default Navigation;