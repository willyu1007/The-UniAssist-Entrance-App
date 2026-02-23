export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogFields = Record<string, unknown>;

type LoggerOptions = {
  service: string;
  base?: LogFields;
};

type Logger = {
  debug: (message: string, fields?: LogFields) => void;
  info: (message: string, fields?: LogFields) => void;
  warn: (message: string, fields?: LogFields) => void;
  error: (message: string, fields?: LogFields) => void;
  child: (fields: LogFields) => Logger;
};

function normalizeFields(fields?: LogFields): LogFields {
  if (!fields) return {};
  const out: LogFields = {};
  Object.entries(fields).forEach(([key, value]) => {
    if (value !== undefined) {
      out[key] = value;
    }
  });
  return out;
}

export function serializeError(error: unknown): LogFields {
  if (error instanceof Error) {
    return {
      errorName: error.name,
      errorMessage: error.message,
      errorStack: error.stack,
    };
  }
  return {
    errorMessage: String(error),
  };
}

export function createLogger(options: LoggerOptions): Logger {
  const base = normalizeFields(options.base);

  const write = (level: LogLevel, message: string, fields?: LogFields): void => {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      service: options.service,
      message,
      ...base,
      ...normalizeFields(fields),
    };
    const line = JSON.stringify(entry);
    if (level === 'error') {
      console.error(line);
      return;
    }
    if (level === 'warn') {
      console.warn(line);
      return;
    }
    console.log(line);
  };

  return {
    debug: (message: string, fields?: LogFields) => write('debug', message, fields),
    info: (message: string, fields?: LogFields) => write('info', message, fields),
    warn: (message: string, fields?: LogFields) => write('warn', message, fields),
    error: (message: string, fields?: LogFields) => write('error', message, fields),
    child: (fields: LogFields) => createLogger({
      service: options.service,
      base: {
        ...base,
        ...normalizeFields(fields),
      },
    }),
  };
}
