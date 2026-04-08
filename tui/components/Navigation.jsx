import React from 'react';
import { Box, Text } from 'ink';

const NavItem = ({ item, isActive }) => (
  <Box marginRight={2}>
    <Text 
      bold={isActive}
      color={isActive ? 'green' : 'gray'}
    >
      {isActive ? '▸ ' : '  '}
      [{item.key}] {item.label}
    </Text>
  </Box>
);

const Navigation = ({ currentView, navItems }) => {
  return (
    <Box 
      flexDirection="row" 
      paddingY={1}
      borderStyle="single" 
      borderColor="gray"
      paddingX={1}
    >
      {navItems.map((item) => (
        <NavItem
          key={item.key}
          item={item}
          isActive={currentView === item.view}
        />
      ))}
    </Box>
  );
};

export default Navigation;