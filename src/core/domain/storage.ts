import type { PlaylistItem } from './playlist';

export interface StorageManifest {
  version: string;
  sourceHash: string;
  updatedAt: number;
  playlist: PlaylistItem[];
}
