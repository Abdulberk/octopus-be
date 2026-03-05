export interface PlaybackRenderer {
  renderImage(source: string): Promise<void>;
  renderVideo(source: string, onEnded: () => void): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  stop(): Promise<void>;
  setVolume(value: number): Promise<void>;
  dispose(): Promise<void>;
}
