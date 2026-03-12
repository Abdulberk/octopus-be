import { PlayerRuntime } from '../../src/app/runtime';
import type { Logger } from '../../src/core/contracts/logger';
import type { PlaylistItem } from '../../src/core/domain/playlist';
import type { StorageManifest } from '../../src/core/domain/storage';

const noopLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

const playlist: PlaylistItem[] = [
  {
    id: 'image-1',
    type: 'image',
    url: 'https://assets.example.com/image-1.jpg',
    duration: 5,
  },
];

const manifest: StorageManifest = {
  version: 'v1',
  sourceHash: 'hash-v1',
  updatedAt: 1,
  playlist,
};

class FakePlaylistSyncService {
  public initializeFromCache = jest.fn(async () => manifest);
  public syncRemote = jest.fn(async () => ({
    source: 'remote' as const,
    changed: false,
    version: manifest.version,
    playlist: manifest.playlist,
  }));
}

class FakePlaybackEngine {
  private state: 'idle' | 'playing' | 'paused' = 'idle';
  public loadPlaylist = jest.fn(async (_items: PlaylistItem[]) => undefined);
  public play = jest.fn(async () => {
    this.state = 'playing';
  });
  public pause = jest.fn(async () => {
    this.state = 'paused';
  });
  public stop = jest.fn(async () => {
    this.state = 'idle';
  });
  public dispose = jest.fn(async () => undefined);

  getState(): 'idle' | 'playing' | 'paused' {
    return this.state;
  }
}

class FakeMqttClientService {
  public start = jest.fn(
    async (_handler: (payload: string) => Promise<void>) => undefined,
  );
  public stop = jest.fn(async () => undefined);
  public publishCommandResult = jest.fn(async () => undefined);
  public publishRuntimeStatus = jest.fn(async () => undefined);
}

class FakeCommandDispatcher {
  public dispatch = jest.fn(async (_payload: string) => ({
    type: 'command_result' as const,
    command: 'play' as const,
    correlationId: 'cor-1',
    status: 'success' as const,
    deviceId: 'device-1',
    ts: Date.now(),
  }));
}

class FakeLifecycleManager {
  public start = jest.fn(() => undefined);
  public stop = jest.fn(() => undefined);
}

describe('PlayerRuntime', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not reload the active playlist when sync reports unchanged content', async () => {
    const playlistSyncService = new FakePlaylistSyncService();
    const playbackEngine = new FakePlaybackEngine();
    const mqttClientService = new FakeMqttClientService();
    const runtime = new PlayerRuntime(
      noopLogger,
      playlistSyncService as never,
      playbackEngine as never,
      mqttClientService as never,
      new FakeCommandDispatcher() as never,
      new FakeLifecycleManager() as never,
      {
        playlistSyncIntervalMs: 1_000,
      },
    );

    await runtime.start();

    expect(playbackEngine.loadPlaylist).toHaveBeenCalledTimes(1);
    expect(playbackEngine.play).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(1_000);

    expect(playbackEngine.loadPlaylist).toHaveBeenCalledTimes(1);
    expect(playbackEngine.play).toHaveBeenCalledTimes(1);

    await runtime.stop();
  });

  it('reloads the active playlist on soft restart even when the version is unchanged', async () => {
    const playlistSyncService = new FakePlaylistSyncService();
    const playbackEngine = new FakePlaybackEngine();
    const mqttClientService = new FakeMqttClientService();
    const runtime = new PlayerRuntime(
      noopLogger,
      playlistSyncService as never,
      playbackEngine as never,
      mqttClientService as never,
      new FakeCommandDispatcher() as never,
      new FakeLifecycleManager() as never,
      {
        playlistSyncIntervalMs: 1_000,
      },
    );

    await runtime.start();
    await runtime.softRestart();

    expect(playbackEngine.stop).toHaveBeenCalledTimes(1);
    expect(playbackEngine.loadPlaylist).toHaveBeenCalledTimes(2);
    expect(playbackEngine.play).toHaveBeenCalledTimes(2);

    await runtime.stop();
  });
});
