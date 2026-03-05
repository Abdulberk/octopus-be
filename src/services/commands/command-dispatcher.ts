import type { CommandHandler } from '../../core/contracts/command-handler';
import type { Logger } from '../../core/contracts/logger';
import type { CommandName } from '../../core/domain/commands';
import type { CommandResultEvent } from '../../core/domain/events';
import { AppError } from '../../core/errors/app-error';
import { validateCommandEnvelope } from './command-validator';
import { IdempotencyStore } from './idempotency-store';

type HandlerMap = Partial<Record<CommandName, CommandHandler>>;

interface CommandDispatcherOptions {
  deviceId: string;
}

export class CommandDispatcher {
  constructor(
    private readonly handlers: HandlerMap,
    private readonly logger: Logger,
    private readonly idempotencyStore: IdempotencyStore<CommandResultEvent>,
    private readonly options: CommandDispatcherOptions,
  ) {}

  async dispatch(rawPayload: string): Promise<CommandResultEvent> {
    try {
      const parsed = this.parsePayload(rawPayload);
      const command = validateCommandEnvelope(parsed);
      const key = `${command.command}:${command.correlationId}`;
      const existing = this.idempotencyStore.get(key);
      if (existing) {
        return {
          ...existing,
          duplicate: true,
          ts: Date.now(),
        };
      }

      const handler = this.handlers[command.command];
      if (!handler) {
        throw new AppError(
          'COMMAND_NOT_IMPLEMENTED',
          `No handler found for ${command.command}`,
        );
      }

      const payload = await handler(command);
      const result: CommandResultEvent = {
        type: 'command_result',
        command: command.command,
        correlationId: command.correlationId,
        status: 'success',
        payload,
        deviceId: this.options.deviceId,
        ts: Date.now(),
      };

      this.idempotencyStore.set(key, result);
      return result;
    } catch (error) {
      const fallback = this.toErrorResult(undefined, error);

      if (error instanceof AppError && error.code !== 'INVALID_JSON') {
        try {
          const parsed = this.parsePayload(rawPayload);
          const typedFallback = this.toErrorResult(parsed, error);
          this.idempotencyStore.set(
            `${typedFallback.command}:${typedFallback.correlationId}`,
            typedFallback,
          );
          return typedFallback;
        } catch {
          // Ignore and continue with generic fallback.
        }
      }

      this.idempotencyStore.set(
        `${fallback.command}:${fallback.correlationId}`,
        fallback,
      );
      return fallback;
    }
  }

  private parsePayload(rawPayload: string): unknown {
    try {
      return JSON.parse(rawPayload) as unknown;
    } catch {
      throw new AppError('INVALID_JSON', 'Command payload is not valid JSON');
    }
  }

  private toErrorResult(
    parsedPayload: unknown,
    error: unknown,
  ): CommandResultEvent {
    const code =
      error instanceof AppError ? error.code : 'COMMAND_EXECUTION_FAILED';
    const message =
      error instanceof Error
        ? error.message
        : 'Unknown command execution error';
    const parsedObject = isObject(parsedPayload) ? parsedPayload : undefined;

    const command = isSupportedCommand(parsedObject?.command)
      ? parsedObject.command
      : 'unknown';
    const correlationId =
      typeof parsedObject?.correlationId === 'string'
        ? parsedObject.correlationId
        : `generated-${Date.now()}`;

    this.logger.warn('Command execution failed', {
      command,
      correlationId,
      code,
      message,
    });

    return {
      type: 'command_result',
      command,
      correlationId,
      status: 'error',
      error: {
        code,
        message,
      },
      deviceId: this.options.deviceId,
      ts: Date.now(),
    };
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isSupportedCommand(value: unknown): value is CommandName {
  return (
    value === 'reload_playlist' ||
    value === 'restart_player' ||
    value === 'play' ||
    value === 'pause' ||
    value === 'set_volume' ||
    value === 'screenshot'
  );
}
