import type { PlaybackRenderer } from '../../core/contracts/renderer';

export class HeadlessRenderer implements PlaybackRenderer {
  private currentVideoTimer?: NodeJS.Timeout;
  private paused = false;
  private endedHandler?: () => void;
  private volume = 1;

  constructor(private readonly defaultVideoMs = 1_000) {}

  async renderImage(_source: string): Promise<void> {
    await this.stop();
  }

  async renderVideo(_source: string, onEnded: () => void): Promise<void> {
    await this.stop();
    this.endedHandler = onEnded;
    this.currentVideoTimer = setTimeout(() => {
      if (!this.paused) {
        this.endedHandler?.();
      }
    }, this.defaultVideoMs);
  }

  async pause(): Promise<void> {
    this.paused = true;
  }

  async resume(): Promise<void> {
    this.paused = false;
  }

  async stop(): Promise<void> {
    if (this.currentVideoTimer) {
      clearTimeout(this.currentVideoTimer);
      this.currentVideoTimer = undefined;
    }
    this.endedHandler = undefined;
    this.paused = false;
  }

  async setVolume(value: number): Promise<void> {
    this.volume = value;
  }

  async dispose(): Promise<void> {
    await this.stop();
  }

  getVolume(): number {
    return this.volume;
  }
}
