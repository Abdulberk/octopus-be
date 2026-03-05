import type { CommandEnvelope, CommandName } from '../../core/domain/commands';
import { AppError } from '../../core/errors/app-error';

const supportedCommands: CommandName[] = [
  'reload_playlist',
  'restart_player',
  'play',
  'pause',
  'set_volume',
  'screenshot',
];

export function validateCommandEnvelope(value: unknown): CommandEnvelope {
  if (!isObject(value)) {
    throw new AppError('INVALID_COMMAND', 'Command payload must be an object');
  }

  const command = value.command;
  const correlationId = value.correlationId;
  const timestamp = value.timestamp;
  const payload = value.payload;

  if (
    typeof command !== 'string' ||
    !supportedCommands.includes(command as CommandName)
  ) {
    throw new AppError(
      'INVALID_COMMAND',
      `Unsupported command: ${String(command)}`,
    );
  }

  if (typeof correlationId !== 'string' || correlationId.trim().length === 0) {
    throw new AppError(
      'INVALID_COMMAND',
      'correlationId must be a non-empty string',
    );
  }

  if (typeof timestamp !== 'number' || Number.isNaN(timestamp)) {
    throw new AppError('INVALID_COMMAND', 'timestamp must be a number');
  }

  if (payload !== undefined && !isObject(payload)) {
    throw new AppError(
      'INVALID_COMMAND',
      'payload must be an object when provided',
    );
  }

  if (command === 'set_volume') {
    const volume = payload?.volume;
    if (
      typeof volume !== 'number' ||
      Number.isNaN(volume) ||
      volume < 0 ||
      volume > 100
    ) {
      throw new AppError(
        'INVALID_COMMAND',
        'set_volume payload must include volume (0-100)',
      );
    }
  }

  return {
    command: command as CommandName,
    correlationId,
    timestamp,
    payload: payload as Record<string, unknown> | undefined,
  };
}

function isObject(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null;
}
