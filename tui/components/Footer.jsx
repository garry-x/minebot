import React from 'react';
import { Box, Text } from 'ink';

const Kbd = ({ children }) => (
  <Text color="blue" bold>{children}</Text>
);

const Footer = ({ currentView }) => (
  <Box flexDirection="column" marginTop={1} paddingX={1}>
    <Text dim>─────────────────────────────────────────────────────────</Text>
    <Box flexDirection="row" marginTop={0}>
      <Box marginRight={3}>
        <Kbd>[1-5]</Kbd><Text dim> views</Text>
      </Box>
      <Box marginRight={3}>
        <Kbd>[↑↓]</Kbd><Text dim> navigate</Text>
      </Box>
      <Box marginRight={3}>
        <Kbd>[Enter]</Kbd><Text dim> select</Text>
      </Box>
      <Box marginRight={3}>
        <Kbd>[Tab]</Kbd><Text dim> panel</Text>
      </Box>
      <Box marginRight={3}>
        <Kbd>[r]</Kbd><Text dim> refresh</Text>
      </Box>
      <Box marginRight={3}>
        <Kbd>[q]</Kbd><Text dim> quit</Text>
      </Box>
    </Box>
  </Box>
);

export default Footer;