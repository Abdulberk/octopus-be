import type { Logger } from '../../core/contracts/logger';
import type { PlaybackRenderer } from '../../core/contracts/renderer';
import type { PlaylistItem } from '../../core/domain/playlist';

type PlaybackState = 'idle' | 'playing' | 'paused';

interface PlaybackEngineOptions {
  loop: boolean;
  defaultImageDurationSec: number;
}

export class PlaybackEngine {
  private playlist: PlaylistItem[] = [];
  private currentIndex = 0;
  private state: PlaybackState = 'idle';
  private transitionTimer?: NodeJS.Timeout;
  private playToken = 0;
  private imageDeadlineMs?: number;
  private imageRemainingMs?: number;
  private hasActiveMedia = false;

  constructor(
    private readonly renderer: PlaybackRenderer,
    private readonly logger: Logger,
    private readonly options: PlaybackEngineOptions,
  ) {}

  async loadPlaylist(items: PlaylistItem[]): Promise<void> {
    const previousState = this.state;
    this.playToken += 1;
    this.imageDeadlineMs = undefined;
    this.imageRemainingMs = undefined;
    this.hasActiveMedia = false;

    if (this.transitionTimer) {
      clearTimeout(this.transitionTimer);
      this.transitionTimer = undefined;
    }

    await this.renderer.stop();

    this.playlist = items;
    this.currentIndex = 0;

    this.logger.info('Playlist loaded into playback engine', {
      itemCount: items.length,
    });

    if (items.length === 0) {
      this.state = 'idle';
      return;
    }

    this.state = previousState;
    if (previousState === 'playing') {
      await this.playCurrentItem(false);
    }
  }

  async play(): Promise<void> {
    if (this.playlist.length === 0) {
      this.logger.warn('Play requested with an empty playlist');
      return;
    }

    if (this.state === 'paused') {
      this.state = 'playing';
      if (
        this.hasActiveMedia &&
        this.isCurrentImage() &&
        this.imageRemainingMs !== undefined
      ) {
        this.imageDeadlineMs = Date.now() + this.imageRemainingMs;
        this.scheduleNextTransition(this.imageRemainingMs);
        return;
      }

      if (this.hasActiveMedia) {
        await this.renderer.resume();
        return;
      }

      await this.playCurrentItem(false);
      return;
    }

    this.state = 'playing';
    await this.playCurrentItem(true);
  }

  async pause(): Promise<void> {
    if (this.state !== 'playing') {
      return;
    }

    if (this.transitionTimer) {
      clearTimeout(this.transitionTimer);
      this.transitionTimer = undefined;
    }

    if (this.isCurrentImage() && this.imageDeadlineMs !== undefined) {
      this.imageRemainingMs = Math.max(0, this.imageDeadlineMs - Date.now());
    }

    this.state = 'paused';
    await this.renderer.pause();
  }

  async stop(): Promise<void> {
    this.state = 'idle';
    this.playToken += 1;
    this.imageDeadlineMs = undefined;
    this.imageRemainingMs = undefined;
    this.hasActiveMedia = false;

    if (this.transitionTimer) {
      clearTimeout(this.transitionTimer);
      this.transitionTimer = undefined;
    }

    await this.renderer.stop();
  }

  async dispose(): Promise<void> {
    await this.stop();
    await this.renderer.dispose();
  }

  getState(): PlaybackState {
    return this.state;
  }

  getCurrentIndex(): number {
    return this.currentIndex;
  }

  private async playCurrentItem(
    resetRenderer: boolean,
    attemptedItems = 0,
  ): Promise<void> {
    if (this.state !== 'playing') {
      return;
    }

    if (this.playlist.length === 0) {
      return;
    }

    if (attemptedItems >= this.playlist.length) {
      this.logger.error('Playback halted because all playlist items failed');
      await this.stop();
      return;
    }

    const item = this.playlist[this.currentIndex];
    if (!item) {
      this.currentIndex = 0;
      await this.playCurrentItem(resetRenderer, attemptedItems + 1);
      return;
    }

    const source = item.localPath ?? item.url;
    const token = ++this.playToken;

    if (this.transitionTimer) {
      clearTimeout(this.transitionTimer);
      this.transitionTimer = undefined;
    }

    if (resetRenderer) {
      await this.renderer.stop();
      this.hasActiveMedia = false;
    }

    try {
      if (item.type === 'image') {
        const durationSec =
          item.duration > 0
            ? item.duration
            : this.options.defaultImageDurationSec;
        const durationMs = Math.max(250, Math.round(durationSec * 1000));
        this.imageRemainingMs = durationMs;
        this.imageDeadlineMs = Date.now() + durationMs;

        await this.renderer.renderImage(source);
        this.hasActiveMedia = true;
        this.scheduleNextTransition(durationMs, token);
      } else {
        this.imageRemainingMs = undefined;
        this.imageDeadlineMs = undefined;
        await this.renderer.renderVideo(source, () => {
          if (token !== this.playToken || this.state !== 'playing') {
            return;
          }
          void this.goToNextItem();
        });
        this.hasActiveMedia = true;
      }
    } catch (error) {
      this.hasActiveMedia = false;
      const message = error instanceof Error ? error.message : 'unknown';
      this.logger.warn('Failed to render media item, skipping to next', {
        index: this.currentIndex,
        source,
        message,
      });
      this.moveIndexForward();
      await this.playCurrentItem(true, attemptedItems + 1);
    }
  }

  private scheduleNextTransition(
    durationMs: number,
    token = this.playToken,
  ): void {
    this.transitionTimer = setTimeout(() => {
      if (token !== this.playToken || this.state !== 'playing') {
        return;
      }
      void this.goToNextItem();
    }, durationMs);
  }

  private async goToNextItem(): Promise<void> {
    this.moveIndexForward();
    await this.playCurrentItem(true);
  }

  private moveIndexForward(): void {
    if (this.playlist.length === 0) {
      this.currentIndex = 0;
      return;
    }

    const nextIndex = this.currentIndex + 1;
    if (nextIndex >= this.playlist.length) {
      this.currentIndex = this.options.loop ? 0 : this.playlist.length - 1;
      if (!this.options.loop) {
        this.state = 'idle';
      }
      return;
    }

    this.currentIndex = nextIndex;
  }

  private isCurrentImage(): boolean {
    return this.playlist[this.currentIndex]?.type === 'image';
  }
}
