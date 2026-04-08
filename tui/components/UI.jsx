import { colors, symbols, layout, separator, subtleSeparator, statusConfig, logLevelColors } from './theme.js';

export { colors, symbols, layout, separator, subtleSeparator, statusConfig, logLevelColors };

export const StatusBadge = ({ status }) => {
  const cfg = statusConfig[status] || statusConfig.UNKNOWN;
  return (
    <Text>
      <Text color={cfg.color}>{cfg.symbol}</Text>
      <Text color={cfg.color}>{status}</Text>
    </Text>
  );
};

export const Section = ({ title, children, width }) => (
  <Box flexDirection="column" width={width}>
    <Box marginBottom={0}>
      <Text bold color={colors.text}>{title}</Text>
    </Box>
    <Text color={colors.border}>{separator(width)}</Text>
    <Box flexDirection="column" marginTop={0}>
      {children}
    </Box>
  </Box>
);

export const ResourceBar = ({ label, value, max = 100 }) => {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));
  const barWidth = 20;
  const filled = Math.floor((percentage / 100) * barWidth);
  const empty = barWidth - filled;

  let barColor = colors.success;
  if (percentage > 80) barColor = colors.error;
  else if (percentage > 60) barColor = colors.warning;

  return (
    <Box>
      <Text color={colors.secondary} width={8}>{label}</Text>
      <Text color={barColor}>{symbols.selected}{'█'.repeat(filled)}</Text>
      <Text color={colors.border}>{'░'.repeat(empty)}</Text>
      <Text color={colors.text}> {Math.round(value)}%</Text>
    </Box>
  );
};

export const Kbd = ({ children }) => (
  <Text color={colors.primary} bold>{children}</Text>
);

export const Hint = ({ children }) => (
  <Text color={colors.dim}>{children}</Text>
);