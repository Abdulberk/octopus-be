export type PlaylistItemType = 'image' | 'video';

export interface BasePlaylistItem {
  id: string;
  type: PlaylistItemType;
  url: string;
  hash?: string;
  localPath?: string;
}

export interface ImagePlaylistItem extends BasePlaylistItem {
  type: 'image';
  duration: number;
}

export interface VideoPlaylistItem extends BasePlaylistItem {
  type: 'video';
}

export type PlaylistItem = ImagePlaylistItem | VideoPlaylistItem;

export interface PlaylistResponse {
  playlist: PlaylistItem[];
  version?: string;
  fetchedAt?: number;
}
