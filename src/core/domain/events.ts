import type { CommandName } from './commands';

export type CommandResultCommand = CommandName | 'unknown';

export interface CommandResultEvent {
  type: 'command_result';
  command: CommandResultCommand;
  correlationId: string;
  status: 'success' | 'error';
  duplicate?: boolean;
  payload?: Record<string, unknown>;
  error?: {
    code: string;
    message: string;
  };
  deviceId: string;
  ts: number;
}

export interface StatusEvent {
  type: 'status';
  status: 'online' | 'offline' | 'degraded';
  deviceId: string;
  ts: number;
  details?: Record<string, unknown>;
}
