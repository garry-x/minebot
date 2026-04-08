import React from 'react';
import { Box, Text } from 'ink';

/**
 * A reusable dropdown/select component with arrow key navigation
 * 
 * @param {Object} props
 * @param {Array} props.items - Array of menu items
 * @param {number} props.selectedIndex - Currently selected index
 * @param {Function} props.onSelect - Callback when item is selected (index)
 * @param {Function} props.onCancel - Callback when Escape is pressed
 * @param {string} props.title - Title for the menu
 * @param {boolean} props.focused - Whether this menu has keyboard focus
 * @param {string} props.borderColor - Border color when focused
 */
const SelectableMenu = ({
  items = [],
  selectedIndex = 0,
  onSelect = () => {},
  onCancel = () => {},
  title = '',
  focused = true,
  borderColor = 'blue'
}) => {
  // Ensure selectedIndex is within bounds
  const safeSelectedIndex = Math.max(0, Math.min(selectedIndex, items.length - 1));

  return (
    <Box
      flexDirection="column"
      borderStyle={focused ? 'round' : 'single'}
      borderColor={focused ? borderColor : 'gray'}
      padding={1}
      width="100%"
    >
      {title && (
        <Box marginBottom={1}>
          <Text bold color={focused ? 'cyan' : 'gray'}>{title}</Text>
        </Box>
      )}
      
      {items.length === 0 ? (
        <Text dim>No items available</Text>
      ) : (
        <Box flexDirection="column">
          {items.map((item, index) => {
            const isSelected = index === safeSelectedIndex;
            const isDisabled = item.disabled || false;
            
            return (
              <Box key={index} flexDirection="row">
                <Text color={isDisabled ? 'gray' : (isSelected ? 'green' : 'white')}>
                  {isSelected ? '› ' : '  '}
                </Text>
                <Text
                  color={isDisabled ? 'gray' : (isSelected ? 'green' : 'white')}
                  bold={isSelected}
                >
                  {item.label || item}
                </Text>
                {item.description && (
                  <Text dim> - {item.description}</Text>
                )}
                {isDisabled && (
                  <Text dim italic> (disabled)</Text>
                )}
              </Box>
            );
          })}
        </Box>
      )}
      
      {/* Footer with instructions */}
      <Box marginTop={1}>
        <Text dim>
          {focused ? (
            <>
              [↑↓] Navigate • [Enter] Select • [Esc] Cancel • [Tab] Switch panels
            </>
          ) : (
            <>
              [Tab] to focus
            </>
          )}
        </Text>
      </Box>
    </Box>
  );
};

export default SelectableMenu;