import { join, extname } from 'node:path';
import type { Logger } from '../../core/contracts/logger';
import type { HttpClient } from '../../core/contracts/network';
import type { StorageAdapter } from '../../core/contracts/storage';
import type { PlaylistItem } from '../../core/domain/playlist';
import type { StorageManifest } from '../../core/domain/storage';
import { validatePlaylistResponse } from './playlist-validator';
import { sha256File, sha256Text } from './hash';

export interface PlaylistSyncOptions {
  endpoint: string;
  cacheRoot: string;
  manifestFileName: string;
  downloadTimeoutMs: number;
}

export interface PlaylistSyncResult {
  source: 'remote' | 'cache';
  changed: boolean;
  version: string;
  playlist: PlaylistItem[];
}

export class PlaylistSyncService {
  private activeManifest?: StorageManifest;

  constructor(
    private readonly httpClient: HttpClient,
    private readonly storage: StorageAdapter,
    private readonly logger: Logger,
    private readonly options: PlaylistSyncOptions,
  ) {}

  async initializeFromCache(): Promise<StorageManifest | null> {
    const manifestPath = this.getManifestPath();
    if (!(await this.storage.exists(manifestPath))) {
      return null;
    }

    try {
      const manifest =
        await this.storage.readJson<StorageManifest>(manifestPath);
      this.activeManifest = manifest;
      this.logger.info('Loaded playlist manifest from cache', {
        version: manifest.version,
        itemCount: manifest.playlist.length,
      });
      return manifest;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown';
      this.logger.warn(
        'Failed to read cached manifest, cache will be ignored',
        { message },
      );
      return null;
    }
  }

  async syncRemote(): Promise<PlaylistSyncResult> {
    try {
      const raw = await this.httpClient.fetchJson<unknown>(
        this.options.endpoint,
      );
      const normalized = validatePlaylistResponse(raw);
      const sourceHash = sha256Text(JSON.stringify(normalized.playlist));
      const version = normalized.version ?? sourceHash;

      if (this.activeManifest && this.activeManifest.version === version) {
        return {
          source: 'remote',
          changed: false,
          version,
          playlist: this.activeManifest.playlist,
        };
      }

      const playlistWithAssets = await this.cacheAssets(normalized.playlist);
      const nextManifest: StorageManifest = {
        version,
        sourceHash,
        updatedAt: Date.now(),
        playlist: playlistWithAssets,
      };

      await this.storage.writeJsonAtomic(this.getManifestPath(), nextManifest);
      this.activeManifest = nextManifest;

      this.logger.info('Playlist synced from remote endpoint', {
        version,
        changed: true,
        itemCount: playlistWithAssets.length,
      });

      return {
        source: 'remote',
        changed: true,
        version,
        playlist: playlistWithAssets,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown';
      this.logger.warn(
        'Remote playlist fetch failed, falling back to cached manifest',
        { message },
      );

      if (!this.activeManifest) {
        throw error;
      }

      return {
        source: 'cache',
        changed: false,
        version: this.activeManifest.version,
        playlist: this.activeManifest.playlist,
      };
    }
  }

  getActivePlaylist(): PlaylistItem[] {
    return this.activeManifest?.playlist ?? [];
  }

  private async cacheAssets(items: PlaylistItem[]): Promise<PlaylistItem[]> {
    const assetsDirectory = this.getAssetsDirectory();
    await this.storage.ensureDir(assetsDirectory);

    const nextItems: PlaylistItem[] = [];

    for (const item of items) {
      const extension = inferExtension(item.url, item.type);
      const targetPath = join(assetsDirectory, `${item.id}${extension}`);
      const partialPath = `${targetPath}.part`;

      try {
        await this.httpClient.downloadFile(
          item.url,
          partialPath,
          this.options.downloadTimeoutMs,
        );

        if (item.hash) {
          const localHash = await sha256File(partialPath);
          if (localHash !== item.hash) {
            throw new Error(`Hash mismatch for ${item.id}`);
          }
        }

        await this.storage.rename(partialPath, targetPath);
        nextItems.push({
          ...item,
          localPath: targetPath,
        });
      } catch (error) {
        await this.storage.remove(partialPath);
        const alreadyCached = await this.storage.exists(targetPath);
        const message = error instanceof Error ? error.message : 'unknown';

        this.logger.warn('Asset caching failed, using fallback strategy', {
          id: item.id,
          message,
          alreadyCached,
        });

        if (alreadyCached) {
          nextItems.push({
            ...item,
            localPath: targetPath,
          });
          continue;
        }

        nextItems.push(item);
      }
    }

    return nextItems;
  }

  private getManifestPath(): string {
    return join(this.options.cacheRoot, this.options.manifestFileName);
  }

  private getAssetsDirectory(): string {
    return join(this.options.cacheRoot, 'assets');
  }
}

function inferExtension(url: string, type: PlaylistItem['type']): string {
  try {
    const parsed = new URL(url);
    const ext = extname(parsed.pathname);
    if (ext.length > 0) {
      return ext;
    }
  } catch {
    // Ignore URL parsing errors and fallback to type-based extension.
  }

  return type === 'image' ? '.jpg' : '.mp4';
}
