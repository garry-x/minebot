import pino from "pino";

export interface LoggerConfig {
  level: string;
  pretty: boolean;
}

const defaultConfig: LoggerConfig = {
  level: "info",
  pretty: false,
};

let loggerInstance: pino.Logger | null = null;

export function createLogger(config: Partial<LoggerConfig> = {}): pino.Logger {
  const merged = { ...defaultConfig, ...config };
  loggerInstance = pino({
    level: merged.level,
    ...(merged.pretty
      ? { transport: { target: "pino-pretty", options: { colorize: true } } }
      : {}),
  });
  return loggerInstance;
}

export function getLogger(): pino.Logger {
  if (!loggerInstance) {
    loggerInstance = pino({ level: "info" });
  }
  return loggerInstance;
}

export type Logger = pino.Logger;
