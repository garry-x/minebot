import React from 'react';
import { Box, Text } from 'ink';

const SelectableMenu = ({
  items = [],
  selectedIndex = 0,
  onSelect = () => {},
  onCancel = () => {},
  title = '',
  focused = true,
  borderColor = 'blue'
}) => {
  const safeSelectedIndex = Math.max(0, Math.min(selectedIndex, items.length - 1));

  return (
    <Box flexDirection="column" width="100%">
      {title && (
        <Box marginBottom={0}>
          <Text bold color={focused ? 'white' : 'gray'}>{title}</Text>
        </Box>
      )}
      <Text dim>──────────────────────────────────────</Text>

      {items.length === 0 ? (
        <Text dim>No items available</Text>
      ) : (
        <Box flexDirection="column">
          {items.map((item, index) => {
            const isSelected = index === safeSelectedIndex;
            const isDisabled = item.disabled || false;

            return (
              <Box key={index} flexDirection="row">
                <Text color={isDisabled ? 'gray' : (isSelected ? 'green' : 'gray')}>
                  {isSelected ? '▸ ' : '  '}
                </Text>
                <Text
                  color={isDisabled ? 'gray' : (isSelected ? 'white' : 'gray')}
                  bold={isSelected}
                >
                  {item.label || item}
                </Text>
                {item.description && (
                  <Text dim>{'  '}{item.description}</Text>
                )}
                {isDisabled && (
                  <Text dim> (disabled)</Text>
                )}
              </Box>
            );
          })}
        </Box>
      )}

      {focused && (
        <Box marginTop={1}>
          <Text dim>
            <Text color="blue">[↑↓]</Text> navigate · <Text color="blue">[Enter]</Text> select · <Text color="blue">[Esc]</Text> cancel
          </Text>
        </Box>
      )}
    </Box>
  );
};

export default SelectableMenu;