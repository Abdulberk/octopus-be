import type { PlaybackRenderer } from '../../core/contracts/renderer';

export class HeadlessRenderer implements PlaybackRenderer {
  private currentVideoTimer?: NodeJS.Timeout;
  private paused = false;
  private endedHandler?: () => void;
  private volume = 1;
  private videoDeadlineMs?: number;
  private videoRemainingMs?: number;

  constructor(private readonly defaultVideoMs = 1_000) {}

  async renderImage(_source: string): Promise<void> {
    await this.stop();
  }

  async renderVideo(_source: string, onEnded: () => void): Promise<void> {
    await this.stop();
    this.endedHandler = onEnded;
    this.videoRemainingMs = this.defaultVideoMs;
    this.scheduleVideoEnd(this.defaultVideoMs);
  }

  async pause(): Promise<void> {
    if (!this.endedHandler) {
      return;
    }

    if (this.currentVideoTimer) {
      clearTimeout(this.currentVideoTimer);
      this.currentVideoTimer = undefined;
    }

    if (this.videoDeadlineMs !== undefined) {
      this.videoRemainingMs = Math.max(0, this.videoDeadlineMs - Date.now());
    }
    this.paused = true;
  }

  async resume(): Promise<void> {
    if (!this.endedHandler) {
      return;
    }

    if (this.currentVideoTimer) {
      return;
    }

    this.paused = false;
    if (this.videoRemainingMs !== undefined) {
      this.scheduleVideoEnd(this.videoRemainingMs);
    }
  }

  async stop(): Promise<void> {
    if (this.currentVideoTimer) {
      clearTimeout(this.currentVideoTimer);
      this.currentVideoTimer = undefined;
    }
    this.endedHandler = undefined;
    this.paused = false;
    this.videoDeadlineMs = undefined;
    this.videoRemainingMs = undefined;
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

  private scheduleVideoEnd(durationMs: number): void {
    if (this.currentVideoTimer) {
      clearTimeout(this.currentVideoTimer);
    }
    this.videoRemainingMs = durationMs;
    this.videoDeadlineMs = Date.now() + durationMs;
    this.currentVideoTimer = setTimeout(() => {
      this.currentVideoTimer = undefined;
      this.videoDeadlineMs = undefined;
      this.videoRemainingMs = undefined;
      if (!this.paused) {
        this.endedHandler?.();
      }
    }, durationMs);
  }
}
