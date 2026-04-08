import React from 'react';
import { Box, Text } from 'ink';

const Navigation = ({ currentView, navItems }) => {
  const activeItem = navItems.find(item => item.view === currentView);
  return (
    <Box flexDirection="row" paddingY={0}>
      {navItems.map((item) => {
        const isActive = currentView === item.view;
        return (
          <Box key={item.key} marginRight={2}>
            <Text color={isActive ? 'white' : 'gray'}>
              {isActive ? '▸ ' : '  '}
            </Text>
            <Text color={isActive ? 'white' : 'gray'} bold={isActive}>
              {item.label}
            </Text>
            <Text dim> [{item.key}]</Text>
          </Box>
        );
      })}
      <Box flexGrow={1} />
      {activeItem && (
        <Text dim color="blue">
          {activeItem.label.toLowerCase()}
        </Text>
      )}
    </Box>
  );
};

export default Navigation;