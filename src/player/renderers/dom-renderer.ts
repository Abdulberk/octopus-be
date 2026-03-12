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
    image.alt = 'Digital signage image content';
    image.style.width = '100%';
    image.style.height = '100%';
    image.style.objectFit = 'contain';

    await new Promise<void>((resolve, reject) => {
      const onLoad = (): void => {
        cleanup();
        resolve();
      };
      const onError = (): void => {
        cleanup();
        reject(new AppError('MEDIA_ERROR', `Image failed to load: ${source}`));
      };
      const cleanup = (): void => {
        image.removeEventListener('load', onLoad);
        image.removeEventListener('error', onError);
      };

      image.addEventListener('load', onLoad);
      image.addEventListener('error', onError);
      image.src = source;
      this.container.appendChild(image);
    });

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

    let playbackStarted = false;
    let playbackCompleted = false;
    const endedHandler = (): void => {
      if (playbackCompleted) {
        return;
      }
      playbackCompleted = true;
      onEnded();
    };
    const onError = (): void => {
      if (!playbackStarted || playbackCompleted) {
        return;
      }
      playbackCompleted = true;
      onEnded();
    };

    this.cleanupEndedListener = () => {
      video.removeEventListener('ended', endedHandler);
      video.removeEventListener('error', onError);
    };

    video.addEventListener('ended', endedHandler);
    video.addEventListener('error', onError);

    this.container.appendChild(video);
    this.currentVideo = video;

    await video
      .play()
      .then(() => {
        playbackStarted = true;
      })
      .catch((error: unknown) => {
        const message =
          error instanceof Error
            ? error.message
            : `Video failed to load: ${source}`;
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
