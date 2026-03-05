import { createHash } from 'node:crypto';
import type {
  PlaylistItem,
  PlaylistResponse,
} from '../../core/domain/playlist';
import { AppError } from '../../core/errors/app-error';

export function validatePlaylistResponse(value: unknown): PlaylistResponse {
  if (!isObject(value)) {
    throw new AppError(
      'PLAYLIST_INVALID',
      'Playlist response must be an object',
    );
  }

  const rawPlaylist = value.playlist;
  if (!Array.isArray(rawPlaylist)) {
    throw new AppError(
      'PLAYLIST_INVALID',
      'Playlist response must include a playlist array',
    );
  }

  const normalized = rawPlaylist.map((item, index) =>
    normalizePlaylistItem(item, index),
  );
  const version =
    typeof value.version === 'string' && value.version.trim().length > 0
      ? value.version
      : undefined;

  return {
    playlist: normalized,
    version,
    fetchedAt: Date.now(),
  };
}

function normalizePlaylistItem(value: unknown, index: number): PlaylistItem {
  if (!isObject(value)) {
    throw new AppError(
      'PLAYLIST_ITEM_INVALID',
      `Playlist item #${index} must be an object`,
    );
  }

  const type = value.type;
  const url = value.url;
  const duration = value.duration;
  const hash = value.hash;
  const idCandidate = value.id;

  if (type !== 'image' && type !== 'video') {
    throw new AppError(
      'PLAYLIST_ITEM_INVALID',
      `Playlist item #${index} has unsupported type`,
    );
  }

  if (typeof url !== 'string' || url.trim().length === 0) {
    throw new AppError(
      'PLAYLIST_ITEM_INVALID',
      `Playlist item #${index} has an invalid url`,
    );
  }

  const id =
    typeof idCandidate === 'string' && idCandidate.trim().length > 0
      ? idCandidate
      : buildItemId(type, url, index);

  if (type === 'image') {
    if (
      typeof duration !== 'number' ||
      Number.isNaN(duration) ||
      duration <= 0
    ) {
      throw new AppError(
        'PLAYLIST_ITEM_INVALID',
        `Playlist image item #${index} must include a positive duration`,
      );
    }

    return {
      id,
      type,
      url,
      duration,
      hash: typeof hash === 'string' ? hash : undefined,
    };
  }

  return {
    id,
    type,
    url,
    hash: typeof hash === 'string' ? hash : undefined,
  };
}

function buildItemId(type: string, url: string, index: number): string {
  const suffix = createHash('sha1')
    .update(`${type}:${url}:${index}`)
    .digest('hex')
    .slice(0, 12);
  return `item-${index}-${suffix}`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
