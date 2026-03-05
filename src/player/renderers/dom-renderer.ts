import type { PlaybackRenderer } from '../../core/contracts/renderer';
import { AppError } from '../../core/errors/app-error';

export class DomRenderer implements PlaybackRenderer {
  private readonly container: HTMLElement;
  private currentVideo?: HTMLVideoElement;
  private currentImage?: HTMLImageElement;
  private currentVolume = 1;
  private cleanupEndedListener?: () => void;

  constructor(containerId = 'player-root') {
    const existing = document.getElementById(containerId);
    if (existing) {
      this.container = existing;
    } else {
      const element = document.createElement('div');
      element.id = containerId;
      document.body.appendChild(element);
      this.container = element;
    }

    this.container.style.width = '100vw';
    this.container.style.height = '100vh';
    this.container.style.backgroundColor = 'black';
    this.container.style.overflow = 'hidden';
  }

  async renderImage(source: string): Promise<void> {
    await this.stop();

    const image = document.createElement('img');
    image.src = source;
    image.alt = 'Digital signage image content';
    image.style.width = '100%';
    image.style.height = '100%';
    image.style.objectFit = 'contain';

    this.container.appendChild(image);
    this.currentImage = image;
  }

  async renderVideo(source: string, onEnded: () => void): Promise<void> {
    await this.stop();

    const video = document.createElement('video');
    video.src = source;
    video.style.width = '100%';
    video.style.height = '100%';
    video.style.objectFit = 'contain';
    video.autoplay = true;
    video.controls = false;
    video.volume = this.currentVolume;

    const onError = (): void => {
      throw new AppError('MEDIA_ERROR', `Video failed to load: ${source}`);
    };

    const endedHandler = (): void => onEnded();
    this.cleanupEndedListener = () => {
      video.removeEventListener('ended', endedHandler);
      video.removeEventListener('error', onError);
    };

    video.addEventListener('ended', endedHandler);
    video.addEventListener('error', onError);

    this.container.appendChild(video);
    this.currentVideo = video;
    await video.play().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'unknown';
      throw new AppError('MEDIA_ERROR', `Video playback failed: ${message}`);
    });
  }

  async pause(): Promise<void> {
    this.currentVideo?.pause();
  }

  async resume(): Promise<void> {
    if (!this.currentVideo) {
      return;
    }
    await this.currentVideo.play().catch(() => {
      // no-op; failure is recoverable for signage loop.
    });
  }

  async stop(): Promise<void> {
    if (this.cleanupEndedListener) {
      this.cleanupEndedListener();
      this.cleanupEndedListener = undefined;
    }

    if (this.currentVideo) {
      this.currentVideo.pause();
      this.currentVideo.src = '';
      this.currentVideo.remove();
      this.currentVideo = undefined;
    }

    if (this.currentImage) {
      this.currentImage.remove();
      this.currentImage = undefined;
    }
  }

  async setVolume(value: number): Promise<void> {
    this.currentVolume = Math.max(0, Math.min(1, value));
    if (this.currentVideo) {
      this.currentVideo.volume = this.currentVolume;
    }
  }

  async dispose(): Promise<void> {
    await this.stop();
  }
}
