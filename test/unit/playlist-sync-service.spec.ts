import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { HttpClient } from '../../src/core/contracts/network';
import type { Logger } from '../../src/core/contracts/logger';
import { FileStorage } from '../../src/infrastructure/storage/file-storage';
import { PlaylistSyncService } from '../../src/services/playlist/playlist-sync-service';

class FakeHttpClient implements HttpClient {
  public shouldFailFetch = false;
  public fetchCalls = 0;
  public response: {
    version?: string;
    playlist: Array<Record<string, unknown>>;
  } = {
    playlist: [
      {
        id: 'image-1',
        type: 'image',
        url: 'http://assets.local/image-1.jpg',
        duration: 5,
      },
      {
        id: 'video-1',
        type: 'video',
        url: 'http://assets.local/video-1.mp4',
      },
    ],
  };

  async fetchJson<T>(_url: string): Promise<T> {
    this.fetchCalls += 1;
    if (this.shouldFailFetch) {
      throw new Error('network-offline');
    }

    return this.response as T;
  }

  async downloadFile(url: string, destinationPath: string): Promise<void> {
    await writeFile(destinationPath, `content:${url}`);
  }
}

const noopLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

describe('PlaylistSyncService', () => {
  let cacheRoot: string;

  beforeEach(async () => {
    cacheRoot = await mkdtemp(join(tmpdir(), 'playlist-sync-'));
  });

  afterEach(async () => {
    await rm(cacheRoot, { recursive: true, force: true });
  });

  it('creates manifest and reuses it when remote fetch fails', async () => {
    const httpClient = new FakeHttpClient();
    const storage = new FileStorage();

    const service = new PlaylistSyncService(httpClient, storage, noopLogger, {
      endpoint: 'http://example.com/playlist',
      cacheRoot,
      manifestFileName: 'manifest.json',
      downloadTimeoutMs: 3_000,
    });

    const first = await service.syncRemote();
    expect(first.source).toBe('remote');
    expect(first.changed).toBe(true);
    expect(first.version.length).toBeGreaterThan(0);
    expect(first.playlist[0]?.localPath).toBeDefined();

    httpClient.shouldFailFetch = true;
    const second = await service.syncRemote();

    expect(second.source).toBe('cache');
    expect(second.changed).toBe(false);
    expect(second.version).toBe(first.version);
  });

  it('deduplicates concurrent sync requests against a single remote fetch', async () => {
    const httpClient = new FakeHttpClient();
    const storage = new FileStorage();
    const service = new PlaylistSyncService(httpClient, storage, noopLogger, {
      endpoint: 'http://example.com/playlist',
      cacheRoot,
      manifestFileName: 'manifest.json',
      downloadTimeoutMs: 3_000,
    });

    const [first, second] = await Promise.all([
      service.syncRemote(),
      service.syncRemote(),
    ]);

    expect(httpClient.fetchCalls).toBe(1);
    expect(first.version).toBe(second.version);
    expect(first.playlist).toEqual(second.playlist);
  });

  it('refreshes playlist content when source changes without a version bump', async () => {
    const httpClient = new FakeHttpClient();
    httpClient.response = {
      version: 'playlist-v1',
      playlist: [
        {
          id: 'image-1',
          type: 'image',
          url: 'http://assets.local/image-1.jpg',
          duration: 5,
        },
      ],
    };

    const storage = new FileStorage();
    const service = new PlaylistSyncService(httpClient, storage, noopLogger, {
      endpoint: 'http://example.com/playlist',
      cacheRoot,
      manifestFileName: 'manifest.json',
      downloadTimeoutMs: 3_000,
    });

    const first = await service.syncRemote();

    httpClient.response = {
      version: 'playlist-v1',
      playlist: [
        {
          id: 'image-2',
          type: 'image',
          url: 'http://assets.local/image-2.jpg',
          duration: 7,
        },
      ],
    };

    const second = await service.syncRemote();

    expect(first.changed).toBe(true);
    expect(second.changed).toBe(true);
    expect(second.version).toBe('playlist-v1');
    expect(second.playlist[0]?.id).toBe('image-2');
  });
});
