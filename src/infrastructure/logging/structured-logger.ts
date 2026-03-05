import type { LogLevel, Logger } from '../../core/contracts/logger';

interface LogEntry {
  ts: number;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
}

interface StructuredLoggerOptions {
  level: LogLevel;
  remoteSink?: (entry: LogEntry) => Promise<void> | void;
}

const levelPriority: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export class StructuredLogger implements Logger {
  constructor(private readonly options: StructuredLoggerOptions) {}

  debug(message: string, context?: Record<string, unknown>): void {
    this.log('debug', message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.log('info', message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.log('warn', message, context);
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.log('error', message, context);
  }

  private log(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
  ): void {
    if (levelPriority[level] < levelPriority[this.options.level]) {
      return;
    }

    const entry: LogEntry = {
      ts: Date.now(),
      level,
      message,
      context,
    };

    const serialized = JSON.stringify(entry);

    switch (level) {
      case 'debug':
      case 'info':
        console.log(serialized);
        break;
      case 'warn':
        console.warn(serialized);
        break;
      case 'error':
        console.error(serialized);
        break;
      default:
        console.log(serialized);
    }

    if (this.options.remoteSink) {
      void Promise.resolve(this.options.remoteSink(entry)).catch(() => {
        // Intentionally no-op: remote log sink must never break local runtime.
      });
    }
  }
}
