export const C = {
  RESET:     "\x1b[0m",
  BOLD:      "\x1b[1m",
  DIM:       "\x1b[2m",
  RED:       "\x1b[31m",
  GREEN:     "\x1b[32m",
  YELLOW:    "\x1b[33m",
  BLUE:      "\x1b[34m",
  MAGENTA:   "\x1b[35m",
  CYAN:      "\x1b[36m",
  WHITE:     "\x1b[37m",
} as const;

export function hpColor(hp: number, max: number): string {
  if (max <= 0) return C.WHITE;
  const r = hp / max;
  if (r > 0.7) return C.GREEN + C.BOLD;
  if (r > 0.3) return C.YELLOW;
  return C.RED + C.BOLD;
}

export function hungerColor(level: number): string {
  if (level > 15) return C.GREEN;
  if (level > 5) return C.YELLOW;
  return C.RED + C.BOLD;
}

export function durabilityColor(pct: number): string {
  if (pct > 0.5) return C.GREEN;
  if (pct > 0.25) return C.YELLOW;
  return C.RED;
}

export function tickColor(ms: number): string {
  if (ms < 20) return C.GREEN;
  if (ms < 50) return C.YELLOW;
  return C.RED;
}

export function ratioColor(ratio: number): string {
  if (ratio >= 1) return C.GREEN;
  if (ratio > 0.8) return C.YELLOW;
  return C.RED;
}

export function sourceColor(s: string): string {
  switch (s) {
    case "BT":     return C.CYAN;
    case "GATHER": return C.GREEN;
    case "COMBAT": return C.RED;
    case "CRAFT":  return C.YELLOW;
    case "SYS":    return C.BLUE;
    default:       return C.RESET;
  }
}

export const BOX = {
  H:  "\u2500",
  V:  "\u2502",
  DH: "\u2550",
  DV: "\u2551",
  TL: "\u2554",
  TR: "\u2557",
  BL: "\u255A",
  BR: "\u255D",
  DL: "\u2560",
  DR: "\u2563",
  SL: "\u255F",
  SR: "\u2562",
} as const;

const ANSI_RE = /\x1b\[[0-9;]*m/g;

export function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, '');
}

export function truncate(text: string, maxWidth: number): string {
  const plain = text.replace(ANSI_RE, '');

  if (plain.length <= maxWidth) {
    return text + ' '.repeat(maxWidth - plain.length);
  }

  if (maxWidth < 1) return '';

  let result = '';
  let visibleCount = 0;
  const targetVisible = maxWidth - 1;
  let i = 0;

  while (i < text.length && visibleCount < targetVisible) {
    if (text[i] === '\x1b' && text[i + 1] === '[') {
      const end = text.indexOf('m', i);
      if (end === -1) break;
      result += text.slice(i, end + 1);
      i = end + 1;
    } else {
      result += text[i];
      visibleCount++;
      i++;
    }
  }

  result += C.RESET + '\u2026';
  const resultPlain = result.replace(ANSI_RE, '');

  return result + ' '.repeat(Math.max(0, maxWidth - resultPlain.length));
}
