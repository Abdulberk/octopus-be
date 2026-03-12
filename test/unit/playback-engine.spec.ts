import type { PlaybackRenderer } from '../../src/core/contracts/renderer';
import { PlaybackEngine } from '../../src/player/engine/playback-engine';

class FakeRenderer implements PlaybackRenderer {
  public readonly calls: string[] = [];
  private endedHandler?: () => void;

  async renderImage(source: string): Promise<void> {
    this.calls.push(`image:${source}`);
  }

  async renderVideo(source: string, onEnded: () => void): Promise<void> {
    this.calls.push(`video:${source}`);
    this.endedHandler = onEnded;
  }

  async pause(): Promise<void> {
    this.calls.push('pause');
  }

  async resume(): Promise<void> {
    this.calls.push('resume');
  }

  async stop(): Promise<void> {
    this.calls.push('stop');
  }

  async setVolume(_value: number): Promise<void> {
    this.calls.push('set-volume');
  }

  async dispose(): Promise<void> {
    this.calls.push('dispose');
  }

  triggerVideoEnd(): void {
    this.endedHandler?.();
  }
}

const noopLogger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

describe('PlaybackEngine', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('transitions image playlist items with configured duration and loops', async () => {
    const renderer = new FakeRenderer();
    const engine = new PlaybackEngine(renderer, noopLogger, {
      loop: true,
      defaultImageDurationSec: 10,
    });

    await engine.loadPlaylist([
      {
        id: 'img-1',
        type: 'image',
        url: 'image://1',
        duration: 1,
      },
      {
        id: 'img-2',
        type: 'image',
        url: 'image://2',
        duration: 1,
      },
    ]);

    await engine.play();
    expect(renderer.calls).toContain('image:image://1');

    jest.advanceTimersByTime(1_000);
    await Promise.resolve();
    await Promise.resolve();
    expect(renderer.calls).toContain('image:image://2');

    jest.advanceTimersByTime(1_000);
    await Promise.resolve();
    await Promise.resolve();
    const loopedCalls = renderer.calls.filter(
      (item) => item === 'image:image://1',
    );
    expect(loopedCalls.length).toBeGreaterThanOrEqual(2);
  });

  it('moves to next item when current video ends', async () => {
    const renderer = new FakeRenderer();
    const engine = new PlaybackEngine(renderer, noopLogger, {
      loop: true,
      defaultImageDurationSec: 10,
    });

    await engine.loadPlaylist([
      {
        id: 'video-1',
        type: 'video',
        url: 'video://1',
      },
      {
        id: 'image-1',
        type: 'image',
        url: 'image://1',
        duration: 1,
      },
    ]);

    await engine.play();
    expect(renderer.calls).toContain('video:video://1');

    renderer.triggerVideoEnd();
    await Promise.resolve();

    expect(renderer.calls).toContain('image:image://1');
  });

  it('clears active media when a newly loaded playlist is empty', async () => {
    const renderer = new FakeRenderer();
    const engine = new PlaybackEngine(renderer, noopLogger, {
      loop: true,
      defaultImageDurationSec: 10,
    });

    await engine.loadPlaylist([
      {
        id: 'img-1',
        type: 'image',
        url: 'image://1',
        duration: 1,
      },
    ]);

    await engine.play();
    expect(engine.getState()).toBe('playing');

    await engine.loadPlaylist([]);

    expect(engine.getState()).toBe('idle');
    expect(
      renderer.calls.filter((item) => item === 'stop').length,
    ).toBeGreaterThanOrEqual(2);
  });

  it('starts the first item after playlist reload while paused', async () => {
    const renderer = new FakeRenderer();
    const engine = new PlaybackEngine(renderer, noopLogger, {
      loop: true,
      defaultImageDurationSec: 10,
    });

    await engine.loadPlaylist([
      {
        id: 'img-1',
        type: 'image',
        url: 'image://1',
        duration: 3,
      },
    ]);
    await engine.play();
    await engine.pause();

    await engine.loadPlaylist([
      {
        id: 'img-2',
        type: 'image',
        url: 'image://2',
        duration: 3,
      },
    ]);
    await engine.play();

    expect(renderer.calls).toContain('image:image://2');
  });
});
