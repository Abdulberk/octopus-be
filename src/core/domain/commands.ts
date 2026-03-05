export type CommandName =
  | 'reload_playlist'
  | 'restart_player'
  | 'play'
  | 'pause'
  | 'set_volume'
  | 'screenshot';

export interface CommandEnvelope {
  command: CommandName;
  correlationId: string;
  timestamp: number;
  payload?: Record<string, unknown>;
}

export interface SetVolumePayload {
  volume: number;
}
