// ─── minebot TUI Design System ───
// Modern CLI aesthetic inspired by Claude Code, Linear, Vercel CLI

export const colors = {
  // Primary palette
  primary:    '#60A5FA',  // Soft blue
  accent:     '#818CF8',  // Indigo highlight
  success:    '#34D399',  // Soft green
  error:      '#F87171',  // Soft red
  warning:    '#FBBF24',  // Soft yellow

  // Text hierarchy
  text:       '#F1F5F9',  // Primary text (near white)
  secondary:  '#94A3B8',  // Secondary text (muted)
  dim:        '#64748B',  // Dim/disabled text
  faint:      '#475569',  // Very subtle text

  // Structural
  border:     '#334155',  // Subtle borders
  surface:    '#1E293B',  // Card surface (dark slate)
  highlight:  '#60A5FA',  // Selection highlight

  // Status-specific
  running:    '#34D399',
  stopped:    '#F87171',
  alive:      '#34D399',
  wounded:    '#FBBF24',
  dead:       '#F87171',
  unknown:    '#64748B',
};

export const symbols = {
  // Status indicators
  dot:        '●',
  dotOpen:    '○',
  dotDim:     '·',

  // Navigation & selection
  selected:   '▸',
  arrow:      '›',
  chevron:    '»',

  // Separators
  line:       '─',
  thinLine:   '─',
  doubleLine: '═',

  // Decorative
  bullet:     '•',
  dash:       '—',
  ellipsis:   '…',

  // Special
  check:      '✓',
  cross:      '✕',
  star:       '★',
  diamond:    '◆',
};

export const layout = {
  separatorWidth: 56,
  sectionGap: 1,
  cardPadding: 1,
  indent: 2,
};

// Helper: create a horizontal separator line
export const separator = (width = layout.separatorWidth) =>
  symbols.thinLine.repeat(width);

// Helper: create a subtle separator line
export const subtleSeparator = (width = layout.separatorWidth) =>
  symbols.dotDim + ' ' + symbols.thinLine.repeat(width - 2) + ' ' + symbols.dotDim;

// Status badge config
export const statusConfig = {
  RUNNING:     { color: colors.running,  symbol: symbols.dot },
  ALIVE:       { color: colors.alive,    symbol: symbols.dot },
  NOT_RUNNING: { color: colors.stopped,  symbol: symbols.dot },
  STOPPED:     { color: colors.stopped,  symbol: symbols.dot },
  WARNING:     { color: colors.warning,  symbol: symbols.dot },
  WOUNDED:     { color: colors.wounded,  symbol: symbols.dot },
  DEAD:        { color: colors.dead,     symbol: symbols.dot },
  ERROR:       { color: colors.error,    symbol: symbols.dot },
  UNKNOWN:     { color: colors.unknown,  symbol: symbols.dotOpen },
};

// Log level colors
export const logLevelColors = {
  INFO:  colors.primary,
  WARN:  colors.warning,
  ERROR: colors.error,
  DEBUG: colors.dim,
};