import type { CommandEnvelope } from '../domain/commands';

export type CommandHandlerResult = Record<string, unknown> | undefined;

export type CommandHandler = (
  command: CommandEnvelope,
) => Promise<CommandHandlerResult> | CommandHandlerResult;
